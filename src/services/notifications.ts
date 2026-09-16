import { getToken, isSupported, onMessage } from 'firebase/messaging';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, getMessagingOrNull } from './firebase';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export type LeagueNotificationType =
  | 'challenge'
  | 'challenge_answered'
  | 'crown_taken'
  | 'rank_change'
  | 'prediction_result';

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
 * Listens only for notifications addressed to this player.
 *
 * Deliberately does not watch the matches collection: every logged match firing
 * a notification at everybody is how an office mutes an app in week two. What
 * reaches a phone now is only what someone decided was worth sending.
 */
export function subscribeToSparkNotifications(
  playerId: string,
  onNotification: (title: string, body: string) => void
) {
  let ready = false;

  return onSnapshot(
    query(collection(db, 'notifications'), where('recipientPlayerId', '==', playerId)),
    (snapshot) => {
      if (!ready) {
        ready = true;
        return;
      }
      snapshot.docChanges()
        .filter((change) => change.type === 'added')
        .forEach((change) => {
          const data = change.doc.data();
          onNotification(
            String(data.title ?? 'Office 8-Ball'),
            String(data.body ?? 'You have a new league update.')
          );
        });
    }
  );
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
