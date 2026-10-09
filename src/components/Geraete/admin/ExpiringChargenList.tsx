'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { formatCharge, formatLagerort } from '../../../common/geraet';
import type { ExpiringCharge } from '../../../common/geraetCharge';
import { expiryColor, formatIsoDate } from './chargeFormat';

export interface ExpiringChargenListProps {
  /** Aus `expiringChargen` — schon nach Ablaufdatum sortiert. */
  entries: ExpiringCharge[];
  /** Öffnet den Artikel. */
  onOpen: (geraetId: string) => void;
}

/**
 * Liste „Läuft bald ab": Chargen mit Bestand, die abgelaufen sind oder
 * innerhalb des Vorlaufs ablaufen. Ohne Einträge wird nichts angezeigt.
 */
export default function ExpiringChargenList({ entries, onOpen }: ExpiringChargenListProps) {
  const t = useTranslations('geraete');
  const format = useFormatter();
  if (entries.length === 0) return null;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('chargen.expiring.hint')}
      </Typography>
      <List disablePadding>
        {entries.map((e) => (
          <ListItemButton
            key={`${e.geraet.id}-${e.charge.id}`}
            divider
            onClick={() => onOpen(e.geraet.id)}
          >
            <ListItemText
              primary={
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <span>{e.geraet.bezeichnung}</span>
                  <Chip size="small" variant="outlined" label={formatCharge(e.charge)} />
                  <Chip
                    size="small"
                    color={e.status === 'abgelaufen' ? 'error' : 'warning'}
                    label={t(`chargen.status.${e.status}`)}
                  />
                </Stack>
              }
              secondary={e.jeBestand
                .map((b) =>
                  t('chargen.chip', {
                    label: formatLagerort(b.bestand.lagerort) || b.bestand.lagerortKey,
                    menge: b.menge,
                  }),
                )
                .join(' · ')}
              slotProps={{ primary: { component: 'div' } }}
            />
            <Box sx={{ ml: 2, textAlign: 'right', whiteSpace: 'nowrap' }}>
              <Typography variant="body2" sx={{ color: expiryColor(e.status) }}>
                {formatIsoDate(format, e.charge.ablaufDatum)}
              </Typography>
              <Typography variant="body2">
                {t('chargen.expiring.menge', { menge: e.menge, einheit: e.geraet.einheit ?? '' })}
              </Typography>
            </Box>
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
