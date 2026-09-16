import { getToken, isSupported, onMessage } from 'firebase/messaging';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, messaging } from './firebase';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export async function registerForPushNotifications(playerId: string): Promise<boolean> {
  if (!vapidKey || !(await isSupported())) return false;
  if (Notification.permission === 'denied') return false;

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
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'Office 8-Ball';
    const body = payload.notification?.body ?? 'You have a new league update.';
    onNotification(title, body);
  });
}

export async function createChallengeNotification(
  recipientPlayerId: string,
  challengerName: string,
  challengerId: string
): Promise<void> {
  await setDoc(doc(collection(db, 'notifications')), {
    type: 'challenge',
    recipientPlayerId,
    challengerId,
    title: 'New pool challenge',
    body: `${challengerName} challenged you to a match.`,
    createdAt: serverTimestamp(),
    read: false,
  });
}
