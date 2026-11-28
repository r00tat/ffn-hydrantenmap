'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import MyBugReports from './MyBugReports';

/**
 * Seite „Meine Meldungen“ (siehe docs/bug-reports.md): Der Melder sieht seine
 * eigenen Bug-Reports und Wünsche samt Status, Lösung und den für ihn
 * bestimmten Kommentaren.
 */
export default function MyBugReportsPage() {
  const t = useTranslations('myBugReports');
  const router = useRouter();
  const { isSignedIn, isAuthLoading } = useFirebaseLogin();

  useEffect(() => {
    if (!isAuthLoading && !isSignedIn) {
      router.replace('/login');
    }
  }, [isAuthLoading, isSignedIn, router]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h3" gutterBottom>
        {t('pageTitle')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        {t('description')}
      </Typography>
      {isSignedIn && <MyBugReports />}
    </Box>
  );
}
