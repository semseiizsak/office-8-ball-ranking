importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDssbeFD5XenfQpFv4LPL15fUqGdaZrIvw',
  authDomain: 'office-8ball.firebaseapp.com',
  projectId: 'office-8ball',
  storageBucket: 'office-8ball.firebasestorage.app',
  messagingSenderId: '414033069172',
  appId: '1:414033069172:web:9dfaf0f6fb41fe9ceb3d21',
});

// A fix to this file should reach installed devices on the next push, not
// whenever the browser's normal (up to 24h) update check happens to run.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

// The push payload is data-only (see api/send-push.ts) so this is the only
// thing that ever displays it — a top-level `notification` field would make
// some browsers auto-display it too, showing the same push twice.
messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title ?? 'Office 8-Ball';
  const options = {
    body: payload.data?.body ?? 'You have a new league update.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data ?? {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = 'https://office-8-ball-rankings.vercel.app';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
