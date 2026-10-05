'use client';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { formatLagerort, type Geraet, type GeraetBestand } from '../../../common/geraet';
import type { SetSkipped } from '../../../common/geraetSet';
import {
  geraetOptionLabel,
  matchesFirecallVehicle,
  usesHours,
  type GeraetEinsatzValidationError,
} from './geraetEinsatzLogic';

/** Eine Zeile der Vorschau mit den Werten, wie sie im Feld stehen. */
export interface SetPreviewRow {
  key: string;
  /** Beim Set-Artikel als Gerät in Stück zurechtgelegt (`expandSetForEinsatz`). */
  geraet: Geraet;
  fromSetArtikel: boolean;
  menge: string;
  stunden: string;
  bestandId: string;
  error?: GeraetEinsatzValidationError | null;
}

export interface SetPreviewGroup {
  key: string;
  title: string;
  rows: SetPreviewRow[];
  skipped: SetSkipped[];
}

export type SetPreviewField = 'menge' | 'stunden' | 'bestandId';

export interface GeraetSetPreviewProps {
  groups: SetPreviewGroup[];
  bestaendeByGeraet: Map<string, GeraetBestand[]>;
  vehicleNames: string[];
  assignedIds: string[];
  onChange: (rowKey: string, field: SetPreviewField, value: string) => void;
}

const EMPTY_BESTAENDE: GeraetBestand[] = [];

/**
 * Vorschau im Einsatz-Dialog, sobald ein Set gewählt ist: je Set die Einträge,
 * die angelegt werden, darunter die einzeln gewählten Artikel. Menge, Stunden
 * und Lagerort sind je Zeile änderbar — ein Set ist eine Vorlage, kein
 * Zwang. Was sich nicht anlegen lässt, steht ausgegraut mit Grund dabei.
 */
export default function GeraetSetPreview({
  groups,
  bestaendeByGeraet,
  vehicleNames,
  assignedIds,
  onChange,
}: GeraetSetPreviewProps) {
  const t = useTranslations('geraetEinsatz.dialog');

  const renderRow = (row: SetPreviewRow) => {
    const { geraet } = row;
    const label = geraetOptionLabel(geraet);
    const bestaende = [...(bestaendeByGeraet.get(geraet.id) ?? EMPTY_BESTAENDE)].sort((a, b) =>
      formatLagerort(a.lagerort).localeCompare(formatLagerort(b.lagerort), 'de'),
    );
    const showBestand = geraet.verbrauchsmaterial && bestaende.length > 0;
    return (
      <ListItem key={row.key} aria-label={label} disableGutters divider sx={{ display: 'block' }}>
        <ListItemText
          primary={label}
          secondary={
            row.fromSetArtikel
              ? t('setArtikel')
              : geraet.verbrauchsmaterial
                ? t('optionConsumable', {
                    bestand: geraet.bestandGesamt ?? 0,
                    einheit: geraet.einheit ?? t('pieces'),
                  })
                : t('optionDevice')
          }
        />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
          {usesHours(geraet) ? (
            <TextField
              size="small"
              label={t('stunden')}
              value={row.stunden}
              onChange={(e) => onChange(row.key, 'stunden', e.target.value)}
              error={row.error === 'invalidStunden'}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              sx={{ width: 140 }}
            />
          ) : (
            <TextField
              size="small"
              label={geraet.einheit ? t('mengeUnit', { einheit: geraet.einheit }) : t('menge')}
              value={row.menge}
              onChange={(e) => onChange(row.key, 'menge', e.target.value)}
              error={row.error === 'invalidMenge'}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              sx={{ width: 140 }}
            />
          )}
          {showBestand && (
            <TextField
              select
              size="small"
              label={t('lagerort')}
              value={row.bestandId}
              onChange={(e) => onChange(row.key, 'bestandId', e.target.value)}
              error={row.error === 'noBestand'}
              sx={{ flexGrow: 1, minWidth: 200 }}
            >
              {bestaende.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {t('lagerortOption', {
                    lagerort: formatLagerort(b.lagerort),
                    anzahl: b.anzahl ?? 0,
                  })}
                  {matchesFirecallVehicle(b.lagerort, vehicleNames, assignedIds)
                    ? ` · ${t('onFirecallVehicle')}`
                    : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
        {row.error && (
          <Typography variant="caption" color="error" component="div" sx={{ mt: 0.5 }}>
            {t(`errors.${row.error}`)}
          </Typography>
        )}
      </ListItem>
    );
  };

  const renderSkipped = (skipped: SetSkipped, groupKey: string) => {
    const name = skipped.name ?? skipped.geraetId;
    return (
      <ListItem
        key={`${groupKey}:skipped:${skipped.geraetId}`}
        aria-label={name}
        disableGutters
        divider
        sx={{ color: 'text.disabled' }}
      >
        <ListItemText
          primary={name}
          secondary={t(`setSkipped.${skipped.reason}`)}
          slotProps={{ secondary: { color: 'text.disabled' } }}
        />
      </ListItem>
    );
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('setPreviewInfo')}
      </Typography>
      {groups.map((group) => (
        <Box key={group.key} sx={{ mb: 2 }}>
          <Typography variant="subtitle2">{group.title}</Typography>
          <List dense disablePadding>
            {group.rows.map(renderRow)}
            {group.skipped.map((s) => renderSkipped(s, group.key))}
          </List>
        </Box>
      ))}
    </Box>
  );
}
