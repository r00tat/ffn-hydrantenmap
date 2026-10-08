'use client';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BekleidungAusgabe } from '../../common/bekleidung';
import OnlineOnly from '../site/OnlineOnly';
import {
  daysBetween,
  isoDateToDate,
  personItems,
  stueckLabel,
  type BekleidungView,
} from './bekleidungUi';
import PersonCreateDialog from './PersonCreateDialog';

/**
 * Was eine Person gerade hat und früher hatte, mit Zeitraum und Dauer.
 * Private Stücke sind gekennzeichnet; eine Ausgabe ohne Datum (Import)
 * steht als „unbekannt" da.
 */
export default function PersonenTab({
  view,
  onIssue,
  onReturn,
}: {
  view: BekleidungView;
  onIssue: (personId: string) => void;
  onReturn: (personId: string) => void;
}) {
  const t = useTranslations('bekleidung');
  const format = useFormatter();
  const [personId, setPersonId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const items = useMemo(
    () => (personId ? personItems(personId, view.ausgaben) : undefined),
    [personId, view.ausgaben],
  );
  const person = view.personById.get(personId);

  const date = (iso?: string) =>
    iso ? format.dateTime(isoDateToDate(iso), { dateStyle: 'medium' }) : t('personen.unknown');

  const label = (a: BekleidungAusgabe) => {
    if (a.stueckId) {
      const s = view.stueckById.get(a.stueckId);
      if (s) return stueckLabel(s, view.artikelById);
    }
    const artikel = view.artikelById.get(a.artikelId)?.bezeichnung ?? a.artikelId;
    return [artikel, a.groesse, a.stueckId ? undefined : t('personen.menge', { menge: a.menge })]
      .filter(Boolean)
      .join(' · ');
  };
  // Privat: das Stück gehört der Person, bei Mengen trägt die Ausgabe selbst
  // das Eigentum (private Zeilen aus dem Import).
  const isPrivat = (a: BekleidungAusgabe) =>
    a.stueckId
      ? view.stueckById.get(a.stueckId)?.eigentum === 'privat'
      : a.eigentum === 'privat';

  const primary = (a: BekleidungAusgabe) => (
    <Stack direction="row" spacing={1} component="span" sx={{ alignItems: 'center' }}>
      <span>{label(a)}</span>
      {isPrivat(a) && <Chip size="small" variant="outlined" label={t('personen.privat')} />}
    </Stack>
  );

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Autocomplete
          options={view.persons}
          value={person ?? null}
          onChange={(_, value) => setPersonId(value?.id ?? '')}
          getOptionLabel={(p) =>
            p.active === false ? `${p.name} (${t('personen.inactive')})` : p.name
          }
          getOptionKey={(p) => p.id ?? p.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label={t('personen.select')} />}
          sx={{ minWidth: 260, flexGrow: 1 }}
        />
        <OnlineOnly>
          <Button startIcon={<PersonAddIcon />} onClick={() => setCreateOpen(true)}>
            {t('actions.newPerson')}
          </Button>
        </OnlineOnly>
      </Stack>

      {items && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            {person?.active !== false && (
              <OnlineOnly>
                <Button variant="outlined" onClick={() => onIssue(personId)}>
                  {t('actions.ausgeben')}
                </Button>
              </OnlineOnly>
            )}
            {items.current.length > 0 && (
              <OnlineOnly>
                <Button variant="outlined" onClick={() => onReturn(personId)}>
                  {t('actions.zuruecknehmen')}
                </Button>
              </OnlineOnly>
            )}
          </Stack>

          <Typography variant="h6">{t('personen.current')}</Typography>
          {items.current.length === 0 ? (
            <Typography color="text.secondary">{t('personen.currentEmpty')}</Typography>
          ) : (
            <List dense disablePadding>
              {items.current.map((a) => (
                <ListItem key={a.id} divider>
                  <ListItemText
                    primary={primary(a)}
                    secondary={a.ausgegebenAm ? t('personen.seit', { date: date(a.ausgegebenAm) }) : t('personen.unknown')}
                    slotProps={{ primary: { component: 'div' } }}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Typography variant="h6">{t('personen.history')}</Typography>
          {items.history.length === 0 ? (
            <Typography color="text.secondary">{t('personen.historyEmpty')}</Typography>
          ) : (
            <List dense disablePadding>
              {items.history.map((a) => (
                <ListItem key={a.id} divider>
                  <ListItemText
                    primary={primary(a)}
                    secondary={[
                      t('personen.zeitraum', { from: date(a.ausgegebenAm), to: date(a.zurueckAm) }),
                      a.ausgegebenAm && a.zurueckAm
                        ? t('personen.dauer', { days: daysBetween(a.ausgegebenAm, a.zurueckAm) })
                        : undefined,
                      a.bemerkung,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    slotProps={{ primary: { component: 'div' } }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      )}

      {createOpen && (
        <PersonCreateDialog
          open
          groupId={view.groupId}
          onClose={() => setCreateOpen(false)}
          onCreated={setPersonId}
        />
      )}
    </>
  );
}
