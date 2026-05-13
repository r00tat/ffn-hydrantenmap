'use client';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { LoginStep } from '../../hooks/auth/types';
import { useDebugLogging } from '../../hooks/useDebugging';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import DebugLoggingSwitch from '../logging/DebugLoggingSwitch';
import {
  getNativeDebugInfo,
  NativeDebugInfo,
} from '../firebase/googleAuthAdapter';
import NativeLoginPanel from '../firebase/NativeLoginPanel';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ProfileUi from './ProfileUi';

const FirebaseUiLogin = dynamic(() => import('../firebase/firebase-ui-login'), {
  ssr: false,
});

export default function LoginUi() {
  const t = useTranslations('login');
  const {
    isSignedIn,
    isAuthLoading,
    isRefreshing,
    loginStep,
  } = useFirebaseLogin();

  const { displayMessages } = useDebugLogging();

  const [autoLoginTimedOut, setAutoLoginTimedOut] = useState(false);
  useEffect(() => {
    if (isSignedIn) return;
    const timer = setTimeout(() => setAutoLoginTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [isSignedIn]);

  const [nativeDebug, setNativeDebug] = useState<NativeDebugInfo | null>(null);
  useEffect(() => {
    const info = getNativeDebugInfo();
    console.info('[LoginUi] capacitor debug', info);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativeDebug(info);
  }, []);

  const isAutoLoginInProgress =
    !isSignedIn && (isAuthLoading || isRefreshing) && !autoLoginTimedOut;

  const loginSteps: { key: LoginStep; labelKey: string }[] = [
    { key: 'authenticating', labelKey: 'stepAuthenticating' },
    { key: 'verifying', labelKey: 'stepVerifying' },
    { key: 'loading_permissions', labelKey: 'stepLoadingPermissions' },
    { key: 'done', labelKey: 'stepDone' },
  ];

  const stepOrder: LoginStep[] = loginSteps.map((s) => s.key);
  const currentStepIndex = stepOrder.indexOf(loginStep ?? 'idle');

  return (
    <>
      {(isAutoLoginInProgress ||
        (isSignedIn &&
          loginStep !== 'done' &&
          loginStep !== 'idle')) && (
        <Paper
          sx={{
            p: 3,
            m: 2,
            backgroundColor: 'action.hover',
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: 'medium', mb: 2 }}>
            {isRefreshing && !isSignedIn
              ? t('loadingCachedAuth')
              : t('signInInProgress')}
          </Typography>
          <List dense disablePadding>
            {loginSteps.map((step, index) => {
              const isCompleted = currentStepIndex > index;
              const isCurrent = currentStepIndex === index;
              return (
                <ListItem key={step.key} disableGutters sx={{ py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {isCompleted ? (
                      <CheckCircleIcon color="success" fontSize="small" />
                    ) : isCurrent ? (
                      <CircularProgress size={18} />
                    ) : (
                      <RadioButtonUncheckedIcon
                        fontSize="small"
                        sx={{ color: 'text.disabled' }}
                      />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={t(
                      step.labelKey as
                        | 'stepAuthenticating'
                        | 'stepVerifying'
                        | 'stepLoadingPermissions'
                        | 'stepDone',
                    )}
                    slotProps={{
                      primary: {
                        sx: {
                          color: isCurrent
                            ? 'text.primary'
                            : isCompleted
                              ? 'text.secondary'
                              : 'text.disabled',
                          fontWeight: isCurrent ? 'medium' : 'normal',
                        },
                      },
                    }}
                  />
                </ListItem>
              );
            })}
          </List>
        </Paper>
      )}
      {!isSignedIn && (
        <>
          <Paper sx={{ p: 2, m: 2 }}>
            <Typography>{t('intro')}</Typography>
            {nativeDebug?.isCapacitorNative ? (
              <NativeLoginPanel />
            ) : (
              <FirebaseUiLogin />
            )}
          </Paper>
          <Box sx={{ mx: 2 }}>
            <DebugLoggingSwitch />
          </Box>
          {displayMessages && nativeDebug && (
            <Paper sx={{ p: 2, m: 2, backgroundColor: 'action.hover' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                {t('capacitorDebug')}
              </Typography>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  m: 0,
                  mt: 1,
                  fontFamily: 'monospace',
                }}
              >
                {JSON.stringify(nativeDebug, null, 2)}
              </Typography>
            </Paper>
          )}
        </>
      )}

      {isSignedIn && <ProfileUi />}
    </>
  );
}
