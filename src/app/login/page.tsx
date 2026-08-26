'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { safeCallbackUrl } from '../../common/safeCallbackUrl';
import DynamicLogin from '../../components/pages/LoginUi';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';

/**
 * Leitet nach erfolgreicher Anmeldung weiter — normalerweise ins Profil, mit
 * `callbackUrl` zurück an den Ausgangspunkt.
 *
 * Gebraucht wird `callbackUrl` von der OAuth-Autorisierung
 * (`/api/oauth/authorize`): Sie bringt keinen eigenen Login mit, sondern
 * delegiert hierher und will danach dorthin zurück. `safeCallbackUrl` lässt
 * nur anwendungsinterne Pfade zu — sonst wäre die Anmeldeseite eine offene
 * Weiterleitung.
 */
function LoginRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, isAuthLoading } = useFirebaseLogin();

  const callbackUrl = safeCallbackUrl(
    searchParams.get('callbackUrl'),
    '/profile',
  );

  useEffect(() => {
    if (!isAuthLoading && isSignedIn) {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, isAuthLoading, isSignedIn, router]);

  return null;
}

export default function Login() {
  const t = useTranslations('login');

  return (
    <Box sx={{ p: 2 }}>
      {/* `useSearchParams` braucht eine Suspense-Grenze, sonst bricht das
          Prerendering der Seite ab. */}
      <Suspense fallback={null}>
        <LoginRedirect />
      </Suspense>
      <Typography variant="h3" gutterBottom>
        {t('pageTitle')}
      </Typography>
      <DynamicLogin />
    </Box>
  );
}
