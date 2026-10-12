'use client';

import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { isoDateToDate, stueckLabel, type BekleidungView } from './bekleidungUi';

const SHOWN_PIECES = 5;

/** Die erfassten Waschgänge, neueste zuerst. */
export default function WaescheTab({ view }: { view: BekleidungView }) {
  const t = useTranslations('bekleidung');
  const format = useFormatter();
  const waeschen = useMemo(
    () => [...view.waeschen].sort((a, b) => b.datum.localeCompare(a.datum)),
    [view.waeschen],
  );

  if (waeschen.length === 0) {
    return <Typography color="text.secondary">{t('waesche.empty')}</Typography>;
  }

  return (
    <List disablePadding>
      {waeschen.map((w) => {
        const labels = w.stueckIds.map((id) => {
          const s = view.stueckById.get(id);
          return s ? stueckLabel(s, view.artikelById) : id;
        });
        const shown = labels.slice(0, SHOWN_PIECES).join(', ');
        const rest = labels.length - SHOWN_PIECES;
        return (
          <ListItem key={w.id} divider>
            <ListItemText
              primary={[
                format.dateTime(isoDateToDate(w.datum), { dateStyle: 'medium' }),
                t(`programm.${w.programm}`) + (w.programmText ? ` (${w.programmText})` : ''),
                t('waesche.count', { count: w.stueckIds.length }),
              ].join(' · ')}
              secondary={[rest > 0 ? `${shown} …` : shown, w.bemerkung].filter(Boolean).join(' — ')}
            />
          </ListItem>
        );
      })}
    </List>
  );
}
