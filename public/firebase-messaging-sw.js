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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Office 8-Ball';
  const options = {
    body: payload.notification?.body ?? 'You have a new league update.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data ?? {},
  };
  self.registration.showNotification(title, options);
});
