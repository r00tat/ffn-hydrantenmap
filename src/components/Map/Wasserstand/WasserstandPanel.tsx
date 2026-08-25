'use client';

import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Portal from '@mui/material/Portal';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Wasserstand } from '../../firebase/firestore';
import WasserstandRechner from './WasserstandRechner';

/**
 * Der Wasserstandsrechner **über der Karte**: schwebend, nicht modal.
 *
 * Nicht modal, weil der Saatpunkt verschoben und der Zuschlag verändert wird,
 * während die Fläche daneben liegt. Über einen Portal an `document.body`
 * gehängt, damit Leaflet die Klicks im Panel nicht als Kartenklicks sieht.
 * Hier steht **nur der Rahmen** — gerechnet wird in `WasserstandRechner`.
 */
export interface WasserstandPanelProps {
  item: Wasserstand;
  open: boolean;
  onClose: () => void;
}

export default function WasserstandPanel({
  item,
  open,
  onClose,
}: WasserstandPanelProps) {
  const t = useTranslations('wasserstand');
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  const [collapsed, setCollapsed] = useState(false);

  if (!open) return null;

  return (
    <Portal>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          zIndex: theme.zIndex.drawer + 50,
          bottom: narrow ? 8 : 24,
          right: narrow ? 8 : 24,
          left: narrow ? 8 : 'auto',
          width: narrow ? 'auto' : 440,
          maxHeight: narrow ? '70vh' : '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 2,
            py: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            flexShrink: 0,
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {t('panelTitle')}
            </Typography>
            <Typography variant="caption" noWrap sx={{ display: 'block' }}>
              {item.name || t('panelSubtitle')}
            </Typography>
          </Box>
          <Tooltip title={collapsed ? t('expand') : t('collapse')}>
            <IconButton
              size="small"
              color="inherit"
              aria-label={collapsed ? t('expand') : t('collapse')}
              onClick={() => setCollapsed((previous) => !previous)}
            >
              {collapsed ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t('close')}>
            <IconButton
              size="small"
              color="inherit"
              aria-label={t('close')}
              onClick={onClose}
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {!collapsed && <WasserstandRechner item={item} />}
      </Paper>
    </Portal>
  );
}
