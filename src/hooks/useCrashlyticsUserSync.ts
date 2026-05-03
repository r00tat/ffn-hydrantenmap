'use client';

import { useEffect } from 'react';
import { setCrashlyticsUserId } from '../components/firebase/crashlytics';

export default function useCrashlyticsUserSync(
  uid: string | undefined,
): void {
  useEffect(() => {
    void setCrashlyticsUserId(uid ?? null);
  }, [uid]);
}
