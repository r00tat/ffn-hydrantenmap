import {
  MessagePayload,
  Messaging,
  getMessaging,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import { useEffect, useState } from 'react';

import app from '../components/firebase/firebase';

export function useMessaging() {
  const [message, setMessage] = useState<MessagePayload>();

  // Handle incoming messages. Called when:
  // - a message is received while the app has focus
  // - the user clicks on an app notification created by a service worker
  //   `messaging.onBackgroundMessage` handler.
  useEffect(() => {
    (async () => {
      if ((await isSupported()) && navigator) {
        const messaging: Messaging = getMessaging(app);
        console.info(`messaging initialized`);
        onMessage(messaging, (payload: MessagePayload) => {
          console.log('Message received. ', payload);
          // ...
          setMessage(payload);
        });

        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage(`messaging loaded`);
      }
    })();
  }, []);

  return message;
}
