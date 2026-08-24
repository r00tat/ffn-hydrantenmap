'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { hasAnyFahrtenbuchManagerRole } from '../managerPermissions';

/**
 * Wie `AdminGuard`, aber lässt auch Gerätemeister durch. Eigene Komponente und
 * keine Erweiterung von `AdminGuard`: Der schützt ein Dutzend anderer Seiten,
 * für die die Fahrtenbuch-Rolle nichts bedeutet.
 */
export default function FahrtenbuchAdminGuard({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations('fahrtenbuch');
  const { isAuthorized, isAdmin, fahrtenbuchGeraetemeister } =
    useFirebaseLogin();

  if (
    !isAuthorized ||
    !hasAnyFahrtenbuchManagerRole({ isAdmin, fahrtenbuchGeraetemeister })
  ) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('admin.noPermission')}</Typography>
      </Container>
    );
  }

  return <>{children}</>;
}
