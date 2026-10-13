'use client';

import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import {
  hasAnyFahrtenbuchManagerRole,
  isFahrtenbuchManager,
} from '../Fahrtenbuch/managerPermissions';
import PersonalAdmin from './PersonalAdmin';

/**
 * Seite „Personal" einer Gruppe — der eine Ort, an dem der Personalstand
 * gepflegt wird, den Fahrtenbuch, Bekleidung und Atemschutz lesen.
 *
 * Zugang wie bisher beim Personen-Reiter des Fahrtenbuchs: Gruppen-Admin,
 * Gerätemeister und Admin. Die Grenze ziehen die Server Actions
 * (`actionFahrtenbuchManagerRequired`); die Prüfung hier ist Bedienkomfort.
 * Siehe docs/personal.md.
 */
export default function PersonalPage() {
  const t = useTranslations('personal');
  const { groups: allGroups, groupId, setGroupId } = useFahrtenbuchGroup();
  const {
    isAuthorized,
    isAdmin,
    fahrtenbuchGeraetemeister,
    groupAdmin,
    groups: userGroups,
  } = useFirebaseLogin();
  const user = useMemo(
    () => ({ isAdmin, fahrtenbuchGeraetemeister, groupAdmin, groups: userGroups }),
    [isAdmin, fahrtenbuchGeraetemeister, groupAdmin, userGroups],
  );
  const groups = useMemo(
    () => allGroups.filter((g) => isFahrtenbuchManager(g.id, user)),
    [allGroups, user],
  );

  if (!isAuthorized || !hasAnyFahrtenbuchManagerRole(user)) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('noPermission')}</Typography>
      </Container>
    );
  }

  // Die gewählte Gruppe gilt seitenübergreifend; ist es eine, deren Personal
  // der Benutzer nicht verwaltet, steht hier die erste, die er verwaltet.
  const selected = groups.find((g) => g.id === groupId) ?? groups[0];

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('title')}
        </Typography>
        <TextField
          select
          size="small"
          label={t('group')}
          value={selected?.id ?? ''}
          onChange={(e) => setGroupId(e.target.value)}
          disabled={groups.length === 0}
          sx={{ minWidth: 200 }}
        >
          {groups.map((g) => (
            <MenuItem key={g.id} value={g.id}>
              {g.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('intro')}
      </Typography>

      {!selected ? (
        <Typography color="text.secondary">{t('noGroups')}</Typography>
      ) : (
        // `key` verwirft Dialog-, Such- und Meldungszustand beim Gruppenwechsel.
        <PersonalAdmin
          key={selected.id}
          groupId={selected.id}
          groupName={selected.name}
        />
      )}
    </Container>
  );
}
