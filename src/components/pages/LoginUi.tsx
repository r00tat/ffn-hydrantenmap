'use client';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { LoginStep } from '../../hooks/auth/types';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import DebugLoggingSwitch from '../logging/DebugLoggingSwitch';
import { auth } from '../firebase/firebase';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const FirebaseUiLogin = dynamic(() => import('../firebase/firebase-ui-login'), {
  ssr: false,
});

export default function LoginUi() {
  const {
    isSignedIn,
    isAuthorized,
    isAuthLoading,
    displayName,
    email,
    signOut,
    uid,
    isRefreshing,
    needsReLogin,
    myGroups,
    loginStep,
  } = useFirebaseLogin();

  const [autoLoginTimedOut, setAutoLoginTimedOut] = useState(false);
  useEffect(() => {
    if (isSignedIn) return;
    const timer = setTimeout(() => setAutoLoginTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [isSignedIn]);

  const [groupClaims, setGroupClaims] = useState('');
  useEffect(() => {
    if (isAuthorized && auth.currentUser) {
      (async () => {
        if (auth.currentUser) {
          const tokenClaims = (await auth.currentUser.getIdTokenResult())
            .claims;
          setGroupClaims(
            ((tokenClaims.groups as string[]) || [])
              .map((g) => myGroups.find((myG) => myG.id === g)?.name || g)
              .sort()
              .join(', ')
          );
        }
      })();
    }
  }, [isAuthorized, myGroups]);

  const isAutoLoginInProgress =
    !isSignedIn && (isAuthLoading || isRefreshing) && !autoLoginTimedOut;

  const loginSteps: { key: LoginStep; label: string }[] = [
    { key: 'authenticating', label: 'Anmeldung wird durchgeführt' },
    { key: 'verifying', label: 'Anmeldung wird verifiziert' },
    { key: 'loading_permissions', label: 'Berechtigungen werden geladen' },
    { key: 'done', label: 'Anmeldung abgeschlossen' },
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
          <Typography variant="body1" fontWeight="medium" sx={{ mb: 2 }}>
            {isRefreshing && !isSignedIn
              ? 'Gespeicherte Anmeldung wird geladen...'
              : 'Anmeldung läuft...'}
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
                    primary={step.label}
                    primaryTypographyProps={{
                      color: isCurrent
                        ? 'text.primary'
                        : isCompleted
                          ? 'text.secondary'
                          : 'text.disabled',
                      fontWeight: isCurrent ? 'medium' : 'normal',
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
            <Typography>
              Für die Nutzung der Einsatzkarte ist eine Anmeldung und manuelle
              Freischaltung erforderlich. Bitte melde dich an.
            </Typography>
            <FirebaseUiLogin />
          </Paper>
        </>
      )}

      {isSignedIn && (
        <Box margin={4}>
          <Typography>
            Willkommen {auth.currentUser?.displayName} (
            {auth.currentUser?.email})!
          </Typography>
          <Button onClick={() => signOut()} variant="contained">
            Logout
          </Button>
          {isAuthorized && (
            <>
              <Typography>
                Dein Benutzer ist freigeschalten und kann verwendet werden!{' '}
                <br />
                Angemeldet als: {displayName} {email} (user id: {uid})
                <br />
                Deine Gruppen:{' '}
              </Typography>
              <ul>
                {myGroups.map((g) => (
                  <li key={g.id}>{g.name}</li>
                ))}
              </ul>
              {!needsReLogin && (
                <Typography>
                  <Link href="/" passHref>
                    <Button variant="outlined">Weiter zur Einsatzkarte</Button>
                  </Link>
                </Typography>
              )}
            </>
          )}
          {!isAuthorized && !isRefreshing && (
            <Typography>
              Dein Benutzer wurde erfolgreich angemeldet, ist aber noch nicht
              freigeschalten. Du hast eine Email zur Adressverifikation
              erhalten. Bitte wende dich nach der Bestätigung der Email an{' '}
              <a href="mailto:hydrantenmap@ff-neusiedlamsee.at&amp;subject=Einsatzkarte Freischaltung">
                hydrantenmap@ff-neusiedlamsee.at
              </a>{' '}
              für die Freischaltung
            </Typography>
          )}

          {needsReLogin && (
            <Typography color="error" borderColor="red">
              Deine Autorisierung hat sich geändert. Um die neuen Rechte nutzten
              zu können, musst du dich aus und neu einloggen.
              <br />
              Deine aktuellen Gruppen laut Datenbank:{' '}
              {myGroups
                .map((g) => g.name)
                .sort()
                .join(', ')}
              <br />
              Deine Gruppen laut Login: {groupClaims}
              <br />
              <Button onClick={() => signOut()} variant="contained">
                Logout
              </Button>
            </Typography>
          )}

          <DebugLoggingSwitch />
        </Box>
      )}
    </>
  );
}
