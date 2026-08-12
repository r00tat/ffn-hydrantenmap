'use client';

import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  shareLinkStatus,
  type FirecallShareLink,
} from '../../common/firecallShareLink';

/** Wie oft der Status neu bewertet wird, solange der Dialog offen ist. */
const TICK_MS = 30_000;

function useTickingNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export interface FirecallShareLinkListProps {
  links: FirecallShareLink[];
  busy: boolean;
  onCopy: (link: FirecallShareLink) => void;
  onEdit: (link: FirecallShareLink) => void;
  onToggleActive: (link: FirecallShareLink, active: boolean) => void;
}

/**
 * Die Zugänge eines Einsatzes. Bewusst eine `List` und keine `Table`: der
 * Dialog wird im Einsatz auf dem Handy geöffnet, eine mehrspaltige Tabelle wäre
 * dort unlesbar.
 */
export default function FirecallShareLinkList({
  links,
  busy,
  onCopy,
  onEdit,
  onToggleActive,
}: FirecallShareLinkListProps) {
  const t = useTranslations('firecallShare');
  const format = useFormatter();
  // Tickt mit, damit ein Link, der während des offenen Dialogs abläuft, auch
  // sichtbar von „aktiv" auf „abgelaufen" wechselt.
  const now = useTickingNow();

  return (
    <List dense>
      {links.map((link) => {
        const status = shareLinkStatus(link, now);
        const active = status === 'active';
        const details = [
          link.expiresAt
            ? t('validUntil', {
                date: format.dateTime(new Date(link.expiresAt), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
              })
            : undefined,
          link.createdAt
            ? link.createdByName
              ? t('createdBy', {
                  date: format.dateTime(new Date(link.createdAt), {
                    dateStyle: 'short',
                  }),
                  name: link.createdByName,
                })
              : t('createdAt', {
                  date: format.dateTime(new Date(link.createdAt), {
                    dateStyle: 'short',
                  }),
                })
            : undefined,
          link.lastSignInAt
            ? t('lastUsed', {
                date: format.relativeTime(new Date(link.lastSignInAt), now),
              })
            : t('neverUsed'),
        ].filter(Boolean);

        return (
          <ListItem
            key={link.uid}
            divider
            secondaryAction={
              <Stack direction="row" spacing={0.5}>
                {/* Die `span`-Wrapper sind nötig, weil ein disabled Button
                    keine Events feuert und der Tooltip sonst nichts mitbekommt. */}
                <Tooltip title={t('copy')}>
                  <span>
                    <IconButton
                      aria-label={t('copy')}
                      disabled={busy || !active}
                      onClick={() => onCopy(link)}
                    >
                      <ContentCopyIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('edit')}>
                  <span>
                    <IconButton
                      aria-label={t('edit')}
                      disabled={busy}
                      onClick={() => onEdit(link)}
                    >
                      <EditIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                {/* Ein abgelaufener Zugang lässt sich nicht per Knopf
                    reaktivieren — dafür führt der Weg über „Bearbeiten" mit
                    neuem Ablaufdatum. */}
                <Tooltip title={active ? t('deactivate') : t('activate')}>
                  <span>
                    <IconButton
                      aria-label={active ? t('deactivate') : t('activate')}
                      disabled={busy || status === 'expired'}
                      onClick={() => onToggleActive(link, !active)}
                    >
                      {active ? <BlockIcon /> : <CheckCircleIcon />}
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            }
          >
            <ListItemText
              primary={
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <Typography component="span" sx={{ fontWeight: 'bold' }}>
                    {link.name}
                  </Typography>
                  <Chip
                    size="small"
                    label={link.canWrite ? t('accessWrite') : t('accessRead')}
                  />
                  <Chip
                    size="small"
                    color={
                      status === 'active'
                        ? 'success'
                        : status === 'expired'
                          ? 'warning'
                          : 'default'
                    }
                    label={
                      status === 'active'
                        ? t('statusActive')
                        : status === 'expired'
                          ? t('statusExpired')
                          : t('statusDisabled')
                    }
                  />
                </Stack>
              }
              secondary={details.join(' · ')}
              slotProps={{ secondary: { sx: { pr: 12 } } }}
            />
          </ListItem>
        );
      })}
    </List>
  );
}
