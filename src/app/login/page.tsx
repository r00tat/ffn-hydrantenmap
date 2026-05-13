'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import DynamicLogin from '../../components/pages/LoginUi';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';

export default function Login() {
  const t = useTranslations('login');
  const router = useRouter();
  const { isSignedIn, isAuthLoading } = useFirebaseLogin();

  useEffect(() => {
    if (!isAuthLoading && isSignedIn) {
      router.replace('/profile');
    }
  }, [isAuthLoading, isSignedIn, router]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h3" gutterBottom>
        {t('pageTitle')}
      </Typography>
      <DynamicLogin />
    </Box>
  );
}
