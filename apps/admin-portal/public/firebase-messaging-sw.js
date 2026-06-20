// Firebase Messaging Service Worker — handles background push notifications
// Uses compat scripts because ESM imports are not supported in service workers
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCbcNDzUgGsSP-STgU-NEFMOT7j3tHYY68',
  authDomain: 'flowtiq-665de.firebaseapp.com',
  projectId: 'flowtiq-665de',
  storageBucket: 'flowtiq-665de.firebasestorage.app',
  messagingSenderId: '484088438532',
  appId: '1:484088438532:web:ad8649cc0d8010f061fa51',
});

const messaging = firebase.messaging();

// Called when a push arrives while the app is in the background or closed
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Flowtiq';
  const body = payload.notification?.body || '';
  const link = payload.data?.deepLinkUrl || '/notifications';

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: link },
  });
});

// Open or focus the app when the notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
