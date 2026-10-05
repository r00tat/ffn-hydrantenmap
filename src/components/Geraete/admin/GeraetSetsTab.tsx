'use client';

import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import type { Geraet, GeraetBestand, GeraetSet } from '../../../common/geraet';
import OnlineOnly from '../../site/OnlineOnly';
import { normalizeCode } from '../einsatz/geraetEinsatzLogic';
import GeraetSetDialog from './GeraetSetDialog';

export interface GeraetSetsTabProps {
  groupId: string;
  canManage: boolean;
  geraete: Geraet[];
  bestaendeByGeraet: Map<string, GeraetBestand[]>;
  /** Alle Sets der Gruppe, auch inaktive. */
  sets: GeraetSet[];
}

/**
 * Reiter „Sets" der Lagerseite: Liste der Sets mit Suche über Name und Code.
 * Anlegen und Ändern nur mit Pflegerecht (Gruppen-Admin, Gerätemeister) —
 * die Grenze zieht die Server Action, die Knöpfe sind Bedienkomfort.
 */
export default function GeraetSetsTab({
  groupId,
  canManage,
  geraete,
  bestaendeByGeraet,
  sets,
}: GeraetSetsTabProps) {
  const t = useTranslations('geraete.sets');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<{ set?: GeraetSet }>();

  const geraetById = useMemo(() => new Map(geraete.map((g) => [g.id, g])), [geraete]);
  // Anders als im Einsatz bleiben inaktive Sets hier sichtbar — sie sollen
  // sich wieder aktivieren lassen.
  const filtered = useMemo(() => {
    const words = normalizeCode(search).split(' ').filter(Boolean);
    return sets.filter((s) => {
      const haystack = [s.name, ...(s.codes ?? [])].map((v) => normalizeCode(v)).join(' ');
      return words.every((w) => haystack.includes(w));
    });
  }, [sets, search]);

  const renderSet = (s: GeraetSet) => {
    const artikel = s.sybosSetArtikelId ? geraetById.get(s.sybosSetArtikelId) : undefined;
    const content: ReactNode = (
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{s.name}</span>
            {artikel && (
              <Chip size="small" variant="outlined" label={t('list.sybos', { name: artikel.bezeichnung })} />
            )}
            {s.active === false && <Chip size="small" label={t('list.inactive')} />}
          </Stack>
        }
        secondary={[t('list.items', { count: s.inhalt?.length ?? 0 }), ...(s.codes ?? [])].join(' · ')}
        slotProps={{ primary: { component: 'div' } }}
      />
    );
    return canManage ? (
      <ListItemButton key={s.id} divider onClick={() => setEdit({ set: s })}>
        {content}
      </ListItemButton>
    ) : (
      <ListItem key={s.id} divider>
        {content}
      </ListItem>
    );
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('list.hint')}
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          type="search"
          label={t('list.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 200 }}
        />
        {canManage && (
          <OnlineOnly>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit({})}>
              {t('list.new')}
            </Button>
          </OnlineOnly>
        )}
      </Stack>

      {filtered.length === 0 ? (
        <Typography color="text.secondary">{t('list.empty')}</Typography>
      ) : (
        <List disablePadding>{filtered.map(renderSet)}</List>
      )}

      {edit && (
        <GeraetSetDialog
          open
          groupId={groupId}
          set={edit.set}
          geraete={geraete}
          bestaendeByGeraet={bestaendeByGeraet}
          sets={sets}
          onClose={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
