import { getToken, isSupported, onMessage } from 'firebase/messaging';
import {
  collection,
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
  | 'cards';

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
    const title = payload.notification?.title ?? 'Office 8-Ball';
    const body = payload.notification?.body ?? 'You have a new league update.';
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
  for (const item of items) {
    batch.set(doc(collection(db, 'notifications')), {
      type: item.type,
      recipientPlayerId: item.recipientPlayerId,
      title: item.title,
      body: item.body,
      matchId,
      createdAt: serverTimestamp(),
      read: false,
    });
  }
  await batch.commit();
}

/** Writes one addressed notification. Cloud Functions relays it to devices. */
export async function sendNotification(params: {
  recipientPlayerId: string;
  type: LeagueNotificationType;
  title: string;
  body: string;
  challengeId?: string;
}): Promise<void> {
  await setDoc(doc(collection(db, 'notifications')), {
    type: params.type,
    recipientPlayerId: params.recipientPlayerId,
    title: params.title,
    body: params.body,
    ...(params.challengeId ? { challengeId: params.challengeId } : {}),
    createdAt: serverTimestamp(),
    read: false,
  });
}

export const notifyMany = async (
  recipientIds: string[],
  payload: { type: LeagueNotificationType; title: string; body: string; challengeId?: string }
): Promise<void> => {
  await Promise.all(
    recipientIds.map((recipientPlayerId) => sendNotification({ recipientPlayerId, ...payload }))
  );
};
