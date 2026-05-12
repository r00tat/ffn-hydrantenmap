'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { auth } from '../firebase/firebase';
import LanguageSelector from '../i18n/LanguageSelector';
import DebugLoggingSwitch from '../logging/DebugLoggingSwitch';

const CONTACT_EMAIL = 'hydrantenmap@ff-neusiedlamsee.at';

export default function ProfileUi() {
  const t = useTranslations('profile');
  const {
    isSignedIn,
    isAuthorized,
    displayName,
    email,
    signOut,
    uid,
    isRefreshing,
    needsReLogin,
    myGroups,
  } = useFirebaseLogin();

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
              .join(', '),
          );
        }
      })();
    }
  }, [isAuthorized, myGroups]);

  if (!isSignedIn) {
    return null;
  }

  return (
    <Box sx={{ margin: 4 }}>
      <Typography>
        {t('welcome', {
          name: auth.currentUser?.displayName ?? '',
          email: auth.currentUser?.email ?? '',
        })}
      </Typography>
      <Button onClick={() => signOut()} variant="contained">
        {t('logout')}
      </Button>
      {isAuthorized && (
        <>
          <Typography sx={{ mt: 2 }}>
            {t('authorizedHeading')}
            <br />
            {t('signedInAs', {
              name: displayName ?? '',
              email: email ?? '',
              uid: uid ?? '',
            })}
            <br />
            {t('yourGroups')}{' '}
          </Typography>
          <ul>
            {myGroups.map((g) => (
              <li key={g.id}>{g.name}</li>
            ))}
          </ul>
          {!needsReLogin && (
            <Typography>
              <Link href="/" passHref>
                <Button variant="outlined">{t('continueToMap')}</Button>
              </Link>
            </Typography>
          )}
        </>
      )}
      {!isAuthorized && !isRefreshing && (
        <Typography sx={{ mt: 2 }}>
          {t.rich('notAuthorized', {
            contactEmail: CONTACT_EMAIL,
            link: (chunks) => (
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Einsatzkarte Freischaltung`}
              >
                {chunks}
              </a>
            ),
          })}
        </Typography>
      )}

      {needsReLogin && (
        <Typography color="error" sx={{ borderColor: 'red', mt: 2 }}>
          {t('claimsOutdated')}
          <br />
          {t('groupsInDb', {
            groups: myGroups
              .map((g) => g.name)
              .sort()
              .join(', '),
          })}
          <br />
          {t('groupsInToken', { groups: groupClaims })}
          <br />
          <Button onClick={() => signOut()} variant="contained">
            {t('logout')}
          </Button>
        </Typography>
      )}

      <LanguageSelector />

      <Box sx={{ mt: 2 }}>
        <DebugLoggingSwitch />
      </Box>
    </Box>
  );
}
