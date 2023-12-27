import { useEffect, useState } from 'react';
import { messaging } from '../components/firebase/messaging';
import { onMessage, MessagePayload } from "firebase/messaging";


export function useMessaging() {
    const [message, setMessage] = useState<MessagePayload>()

// Handle incoming messages. Called when:
// - a message is received while the app has focus
// - the user clicks on an app notification created by a service worker
//   `messaging.onBackgroundMessage` handler.
    useEffect(() => {
        const messaging = getMessaging();
        onMessage(messaging, (payload) => {
            console.log('Message received. ', payload);
            // ...
            setMessage(payload)
        });

    }, []);

    return message;
}