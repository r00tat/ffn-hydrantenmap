'use client';

import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCan } from '../../hooks/usePermissions';

/**
 * Verweis auf „Mitglieder und Rollen" einer Gruppe — für Verwaltungsseiten,
 * die früher ihre eigene Rollenauswahl hatten (Gerätemeister im Fahrtenbuch).
 * Rollen werden an genau einer Stelle vergeben.
 */
export default function MemberRolesLink({ groupId }: { groupId: string }) {
  const t = useTranslations('groupRoles');
  const allowed = useCan(groupId, 'rollen.assign');
  if (!allowed) return null;

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('linkHint')}
      </Typography>
      <Button
        component={Link}
        href={`/groups/${encodeURIComponent(groupId)}`}
        variant="outlined"
        startIcon={<ManageAccountsIcon />}
      >
        {t('linkAction')}
      </Button>
    </Paper>
  );
}
