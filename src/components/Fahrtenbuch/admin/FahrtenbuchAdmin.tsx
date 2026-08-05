'use client';

import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import useFahrtenbuchGroup from '../../../hooks/useFahrtenbuchGroup';
import AdminGuard from '../../site/AdminGuard';
import FahrtenbuchImportDialog from './FahrtenbuchImportDialog';
import GroupSettings from './GroupSettings';
import PersonAdmin from './PersonAdmin';
import ShareLinkSection from './ShareLinkSection';
import VehicleAdmin from './VehicleAdmin';

/**
 * Klammer über die Stammdaten: Gruppenauswahl plus Tabs für Fahrzeuge und
 * Personen. Die Gruppen kommen aus `useFahrtenbuchGroup`, damit hier dieselben
 * Ausschlüsse gelten wie in den Regeln und den Server Actions.
 */
export default function FahrtenbuchAdmin() {
  const t = useTranslations('fahrtenbuch');
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const [tab, setTab] = useState(0);
  // Fällt eine Gruppe aus den Claims, ohne dass die Auswahl nachzieht, ist die
  // ID immer noch besser als ein leerer Name.
  const groupName = groups.find((g) => g.id === groupId)?.name ?? groupId ?? '';

  return (
    <AdminGuard>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {t('admin.title')}
          </Typography>
          <TextField
            select
            size="small"
            label={t('group')}
            value={groupId ?? ''}
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

        {groups.length === 0 || !groupId ? (
          <Typography color="text.secondary">{t('admin.noGroups')}</Typography>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              sx={{ mb: 2 }}
            >
              <Tab label={t('admin.vehicles')} />
              <Tab label={t('admin.persons')} />
              <Tab label={t('admin.settings')} />
              <Tab label={t('shareLink.heading')} />
              <Tab label={t('admin.pdfImport.tab')} />
            </Tabs>

            {/* `key` verwirft Dialog- und Meldungszustand beim Gruppenwechsel,
                damit keine Meldung der vorigen Gruppe stehen bleibt. */}
            {tab === 0 && (
              <VehicleAdmin
                key={groupId}
                groupId={groupId}
                groupName={groupName}
              />
            )}
            {tab === 1 && (
              <PersonAdmin
                key={groupId}
                groupId={groupId}
                groupName={groupName}
              />
            )}
            {tab === 2 && <GroupSettings key={groupId} groupId={groupId} />}
            {tab === 3 && (
              <ShareLinkSection
                key={groupId}
                groupId={groupId}
                groupName={groupName}
              />
            )}
            {/* Bewusst ein Dialog und kein Panel — damit bleibt der Aufbau bei
                den anderen Importen; `onClose` fällt auf den ersten Tab zurück. */}
            {tab === 4 && (
              <FahrtenbuchImportDialog
                key={groupId}
                groupId={groupId}
                groupName={groupName}
                onClose={() => setTab(0)}
              />
            )}
          </>
        )}
      </Container>
    </AdminGuard>
  );
}
