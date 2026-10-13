'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { canOpenFahrtenbuchAdmin } from './adminTabs';

/**
 * Wie `AdminGuard`, aber lässt jeden durch, der in einer Gruppe mindestens
 * einen Reiter der Verwaltung sieht (`canOpenFahrtenbuchAdmin`).
 * Eigene Komponente und keine Erweiterung von `AdminGuard`: Der schützt ein
 * Dutzend anderer Seiten, für die die Gruppenrollen nichts bedeuten.
 */
export default function FahrtenbuchAdminGuard({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations('fahrtenbuch');
  const { isAuthorized, isAdmin, groupRoles } = useFirebaseLogin();

  if (!isAuthorized || !canOpenFahrtenbuchAdmin({ isAdmin, groupRoles })) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('admin.noPermission')}</Typography>
      </Container>
    );
  }

  return <>{children}</>;
}
