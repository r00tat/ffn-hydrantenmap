import app from './firebase';
import { Messaging, getMessaging, getToken } from 'firebase/messaging';

export const messaging: Messaging = getMessaging(app);

export async function requestPermission(): Promise<boolean> {
    console.log('Requesting permission...');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        console.log('Notification permission granted.');
        return true;
    }
    console.log(`Permission not granted: ${permission}`)
    return false;
}


export async function registerMessaging(): Promise<string|undefined> {
// Get registration token. Initially this makes a network call, once retrieved
// subsequent calls to getToken will return from cache.

const granted = await requestPermission();
if(granted){
   
    const token = await getToken(messaging, 
        {
        vapidKey: 'BBFxZ_tOn6iVR5Sua3oXDBPyw-FYZfHWZcPD2emQ8Zv-r7LuNyKVs1U11uiEj5FZLoXH3nff_CqPqlqKQFJvr8E' 
    });
    return token;
    }

return undefined;

}

