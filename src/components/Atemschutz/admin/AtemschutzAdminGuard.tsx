'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { hasAnyGroupAdminRole } from '../../../common/groupPermissions';

/**
 * Wie `AdminGuard`, lässt aber auch Gruppen-Admins durch.
 *
 * Kein `hasAnyFahrtenbuchManagerRole`: Der Gerätemeister pflegt Fahrzeuge und
 * Personen des Fahrtenbuchs, die Atemschutz-Ausrüstung gehört nicht dazu.
 * Wer sie pflegen soll, bekommt die Gruppen-Admin-Rolle.
 *
 * Das ist keine Sicherheitsgrenze — die steht in
 * `actionGroupAdminRequired(groupId)` in den Server Actions. Hier wird nur
 * eine Seite ausgeblendet, die dem Benutzer nichts nützt.
 */
export default function AtemschutzAdminGuard({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations('atemschutz');
  const { isAuthorized, isAdmin, groupAdmin } = useFirebaseLogin();

  if (!isAuthorized || !hasAnyGroupAdminRole({ isAdmin, groupAdmin })) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('admin.noPermission')}</Typography>
      </Container>
    );
  }

  return <>{children}</>;
}
