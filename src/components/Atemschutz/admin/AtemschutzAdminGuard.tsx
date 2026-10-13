'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { useCanAny } from '../../../hooks/usePermissions';

/**
 * Wie `AdminGuard`, lässt aber jeden durch, der in einer Gruppe
 * `gruppe.manage` hat.
 *
 * Nicht `geraete.manage`: Der Gerätemeister pflegt Fahrzeuge, Personen und
 * Geräte, die Atemschutz-Ausrüstung gehört nicht dazu. Wer sie pflegen soll,
 * bekommt die Rolle Gruppen-Admin.
 *
 * Das ist keine Sicherheitsgrenze — die steht in
 * `actionPermissionRequired(groupId, 'gruppe.manage')` in den Server Actions.
 * Hier wird nur eine Seite ausgeblendet, die dem Benutzer nichts nützt.
 */
export default function AtemschutzAdminGuard({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations('atemschutz');
  const { isAuthorized } = useFirebaseLogin();
  const canManageAnyGroup = useCanAny('gruppe.manage');

  if (!isAuthorized || !canManageAnyGroup) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('admin.noPermission')}</Typography>
      </Container>
    );
  }

  return <>{children}</>;
}
