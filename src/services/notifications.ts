import { getToken, isSupported, onMessage } from 'firebase/messaging';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, getMessagingOrNull } from './firebase';
import { EarnedNotification } from '../utils/earned';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export type LeagueNotificationType =
  | 'challenge'
  | 'challenge_answered'
  /** A match just went on the table; calls are open. */
  | 'match_live'
  | 'match_result'
  | 'crown_taken'
  | 'rank_change'
  | 'prediction_result'
  /** Somebody landed on the wall of shame. */
  | 'shame'
  /** Tournament sign-ups, draws and results. */
  | 'tournament'
  /** Friday's weekly awards are in. */
  | 'weekly_awards'
  /** Packs, big pulls and trades. */
  | 'cards'
  /** Somebody called it exactly and took the jackpot. */
  | 'jackpot';

/** One addressed message as the inbox shows it. */
export interface LeagueNotification {
  id: string;
  type: LeagueNotificationType;
  title: string;
  body: string;
  challengeId?: string;
  matchId?: string;
  createdAt: number;
  read: boolean;
}

/** How many the bell keeps; older ones stay in Firestore but nobody scrolls that far. */
export const INBOX_LIMIT = 40;

const toNotification = (id: string, data: Record<string, unknown>): LeagueNotification => {
  const created = data.createdAt as { toMillis?: () => number } | null | undefined;
  return {
    id,
    type: (data.type as LeagueNotificationType) ?? 'match_result',
    title: String(data.title ?? 'Office 8-Ball'),
    body: String(data.body ?? ''),
    ...(typeof data.challengeId === 'string' ? { challengeId: data.challengeId } : {}),
    ...(typeof data.matchId === 'string' ? { matchId: data.matchId } : {}),
    // A locally pending write has no server time yet; it is by definition "now".
    createdAt: created?.toMillis ? created.toMillis() : Date.now(),
    read: data.read === true,
  };
};

export async function registerForPushNotifications(playerId: string): Promise<boolean> {
  if (!vapidKey || !(await isSupported())) return false;
  if (typeof Notification === 'undefined' || Notification.permission === 'denied') return false;

  const messaging = getMessagingOrNull();
  if (!messaging) return false;

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
  });
  if (!token) return false;

  // FCM web tokens occasionally rotate on the same device (a browser update,
  // the service worker itself changing, etc). Nothing ever deleted the old
  // one, so a device could end up with two live tokens both receiving every
  // push — the same notification showing twice on one phone. Track the last
  // token this exact browser registered for this player, and drop it the
  // moment a different one shows up.
  const lastTokenKey = `office_8ball_fcm_token:${playerId}`;
  const previousToken = localStorage.getItem(lastTokenKey);
  if (previousToken && previousToken !== token) {
    await deleteDoc(doc(collection(db, 'players', playerId, 'notificationTokens'), previousToken)).catch(() => undefined);
  }
  localStorage.setItem(lastTokenKey, token);

  await setDoc(doc(collection(db, 'players', playerId, 'notificationTokens'), token), {
    token,
    platform: navigator.userAgent,
    updatedAt: serverTimestamp(),
  });
  return true;
}

export function subscribeToForegroundNotifications(onNotification: (title: string, body: string) => void) {
  const messaging = getMessagingOrNull();
  if (!messaging) return () => undefined;
  return onMessage(messaging, (payload) => {
    // Data-only payload (api/send-push.ts) — see firebase-messaging-sw.js for why.
    const title = payload.data?.title ?? 'Office 8-Ball';
    const body = payload.data?.body ?? 'You have a new league update.';
    onNotification(title, body);
  });
}

/**
 * The inbox: everything addressed to this player, newest first, plus the
 * messages that arrived while the app was open so they can be surfaced as
 * they land.
 *
 * Deliberately does not watch the matches collection: every logged match firing
 * a notification at everybody is how an office mutes an app in week two. What
 * reaches a phone now is only what someone decided was worth sending.
 */
export function subscribeToInbox(
  playerId: string,
  onChange: (inbox: LeagueNotification[], arrived: LeagueNotification[]) => void
) {
  let ready = false;

  return onSnapshot(
    query(collection(db, 'notifications'), where('recipientPlayerId', '==', playerId)),
    (snapshot) => {
      const inbox = snapshot.docs
        .map((entry) => toNotification(entry.id, entry.data()))
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, INBOX_LIMIT);
      const arrived = ready
        ? snapshot.docChanges()
            .filter((change) => change.type === 'added')
            .map((change) => toNotification(change.doc.id, change.doc.data()))
        : [];
      ready = true;
      onChange(inbox, arrived);
    }
  );
}

/** Marks what the reader has now seen; a no-op when everything already is. */
export async function markInboxRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, 'notifications', id), { read: true }));
  await batch.commit();
}

/** Writes the whole set a result earned in one commit, so nobody hears half of it. */
export async function sendEarnedNotifications(items: EarnedNotification[], matchId: string): Promise<void> {
  if (items.length === 0) return;
  const batch = writeBatch(db);
  const refs = items.map(() => doc(collection(db, 'notifications')));
  items.forEach((item, index) => {
    batch.set(refs[index], {
      type: item.type,
      recipientPlayerId: item.recipientPlayerId,
      title: item.title,
      body: item.body,
      matchId,
      createdAt: serverTimestamp(),
      read: false,
    });
  });
  await batch.commit();
  items.forEach((item, index) =>
    triggerPush([item.recipientPlayerId], { title: item.title, body: item.body, type: item.type, notificationId: refs[index].id })
  );
}

/**
 * Best-effort call to the Vercel function (api/send-push.ts) that relays this
 * to devices via FCM. Runs on Vercel rather than a Firebase Cloud Function so
 * real background push works without ever needing the Blaze plan. Never
 * blocks or throws — the Firestore write is what actually matters for the
 * in-app inbox, which works the same whether or not this succeeds.
 */
function triggerPush(
  recipientPlayerIds: string[],
  payload: { title: string; body: string; type: LeagueNotificationType; notificationId: string }
): void {
  if (recipientPlayerIds.length === 0) return;
  fetch('/api/send-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientPlayerIds, ...payload }),
  }).catch(() => undefined);
}

/** Writes one addressed notification and relays it to devices. */
export async function sendNotification(params: {
  recipientPlayerId: string;
  type: LeagueNotificationType;
  title: string;
  body: string;
  challengeId?: string;
}): Promise<void> {
  const ref = doc(collection(db, 'notifications'));
  await setDoc(ref, {
    type: params.type,
    recipientPlayerId: params.recipientPlayerId,
    title: params.title,
    body: params.body,
    ...(params.challengeId ? { challengeId: params.challengeId } : {}),
    createdAt: serverTimestamp(),
    read: false,
  });
  triggerPush([params.recipientPlayerId], { title: params.title, body: params.body, type: params.type, notificationId: ref.id });
}

export const notifyMany = async (
  recipientIds: string[],
  payload: { type: LeagueNotificationType; title: string; body: string; challengeId?: string }
): Promise<void> => {
  await Promise.all(
    recipientIds.map((recipientPlayerId) => sendNotification({ recipientPlayerId, ...payload }))
  );
};

/**
 * Somebody took the jackpot: the whole office hears it, the takers in their
 * own words. Best effort, like every other notification.
 */
export async function announceJackpot(
  takers: Array<{ playerId: string; amount: number }>,
  players: Array<{ id: string; name: string }>
): Promise<void> {
  if (takers.length === 0) return;
  const first = (id: string) => (players.find((player) => player.id === id)?.name ?? 'Someone').split(' ')[0];
  const names = takers.map((taker) => first(taker.playerId));
  const who = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const total = takers.reduce((sum, taker) => sum + taker.amount, 0);
  const takerIds = new Set(takers.map((taker) => taker.playerId));
  await Promise.all([
    ...takers.map((taker) =>
      sendNotification({
        recipientPlayerId: taker.playerId,
        type: 'jackpot',
        title: '💎 You took the jackpot',
        body: `${taker.amount} coins are in your stack.`,
      })
    ),
    notifyMany(
      players.map((player) => player.id).filter((id) => !takerIds.has(id)),
      {
        type: 'jackpot',
        title: `💎 ${who} took the jackpot`,
        body: `${total} coins, called winner, balls and pocket. The pot starts again.`,
      }
    ),
  ]);
}
