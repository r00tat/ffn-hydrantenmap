'use client';

import { Capacitor } from '@capacitor/core';
import React, { useEffect, useState } from 'react';
import PermissionOnboardingWizard from './PermissionOnboardingWizard';

const PREF_KEY = 'permissionOnboardingCompleted';

type WizardState = 'loading' | 'show' | 'hidden';

export default function PermissionOnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<WizardState>('loading');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setState('hidden');
      return;
    }
    let cancelled = false;
    (async () => {
      const { Preferences } = await import('@capacitor/preferences');
      const v = await Preferences.get({ key: PREF_KEY });
      if (cancelled) return;
      setState(v.value === '1' ? 'hidden' : 'show');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleComplete = async () => {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREF_KEY, value: '1' });
    setState('hidden');
  };

  if (state === 'loading') return null;
  if (state === 'show') {
    return <PermissionOnboardingWizard onComplete={handleComplete} />;
  }
  return <>{children}</>;
}
