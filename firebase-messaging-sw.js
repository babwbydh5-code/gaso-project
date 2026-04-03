importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBHUsLto4xvHn01F8aA_wnNx8MfDfpaY-w",
  authDomain: "gas-sudan-81ecc.firebaseapp.com",
  projectId: "gas-sudan-81ecc",
  storageBucket: "gas-sudan-81ecc.firebasestorage.app",
  messagingSenderId: "124782250398",
  appId: "1:124782250398:web:89eb5d87fb6ff57b706e8f",
  measurementId: "G-MW0YMLDFHW",
  databaseURL: "https://gas-sudan-81ecc-default-rtdb.firebaseio.com/"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/favicon.ico' // Default icon placeholder
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
