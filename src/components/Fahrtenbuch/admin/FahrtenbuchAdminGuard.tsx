'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { hasAnyFahrtenbuchManagerRole } from '../managerPermissions';

/**
 * Wie `AdminGuard`, aber lässt auch Gruppen-Admins und Gerätemeister durch.
 * Eigene Komponente und keine Erweiterung von `AdminGuard`: Der schützt ein
 * Dutzend anderer Seiten, für die die Gruppenrollen nichts bedeuten.
 */
export default function FahrtenbuchAdminGuard({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations('fahrtenbuch');
  const { isAuthorized, isAdmin, fahrtenbuchGeraetemeister, groupAdmin } =
    useFirebaseLogin();

  if (
    !isAuthorized ||
    !hasAnyFahrtenbuchManagerRole({
      isAdmin,
      fahrtenbuchGeraetemeister,
      groupAdmin,
    })
  ) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('admin.noPermission')}</Typography>
      </Container>
    );
  }

  return <>{children}</>;
}
