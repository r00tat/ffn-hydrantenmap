'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import { KostenersatzEmailVersand } from '../../common/kostenersatz';
import { formatTimestamp } from '../../common/time-format';

export interface KostenersatzEmailHistoryProps {
  entries: KostenersatzEmailVersand[];
}

/**
 * Versandprotokoll einer Berechnung: wann, an wen und von wem die Rechnung
 * per E-Mail hinausging. Zeigt auch, wie oft versandt wurde.
 */
export default function KostenersatzEmailHistory({ entries }: KostenersatzEmailHistoryProps) {
  const t = useTranslations('kostenersatz.emailHistory');

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary">
        {entries.length > 0 ? t('titleCount', { count: entries.length }) : t('title')}
      </Typography>
      {entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('none')}
        </Typography>
      ) : (
        <List dense disablePadding>
          {entries.map((entry, index) => {
            const details = [
              entry.cc && entry.cc.length > 0 ? t('cc', { cc: entry.cc.join(', ') }) : undefined,
              entry.sentBy ? t('sentBy', { user: entry.sentBy }) : undefined,
            ].filter(Boolean);
            return (
              <ListItem key={`${entry.sentAt}-${index}`} disableGutters>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <MarkEmailReadIcon fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText
                  primary={t('entry', {
                    date: formatTimestamp(entry.sentAt),
                    to: entry.to || t('unknownRecipient'),
                  })}
                  secondary={details.length > 0 ? details.join(' · ') : undefined}
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
}
