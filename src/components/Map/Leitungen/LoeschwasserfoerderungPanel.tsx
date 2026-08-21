'use client';

import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Portal from '@mui/material/Portal';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Connection } from '../../firebase/firestore';
import VersorgungRechner from './VersorgungRechner';

/**
 * Der Rechner für die Löschwasserversorgung **über der Karte**: ein schwebendes,
 * nicht modales Panel.
 *
 * Nicht modal, weil beim Schieben des Reglers die Pumpen auf der Leitung und die
 * Fahrtroute mitwandern — und genau das will man dabei sehen. Ein
 * bildschirmfüllender Dialog verdeckte die Karte; am Handy war er von einer
 * eigenen Seite nicht zu unterscheiden.
 *
 * Über einen Portal an `document.body` gehängt, damit Leaflet die Klicks im
 * Panel nicht als Kartenklicks sieht. Einklappbar, weil das Panel offen bleibt,
 * während man die Karte verschiebt.
 *
 * Hier steht **nur der Rahmen**. Gerechnet wird in `VersorgungRechner`, der
 * denselben Inhalt auch auf der Seite `/loeschwasserversorgung` in der Spalte
 * neben der Karte trägt.
 */

export interface LoeschwasserfoerderungPanelProps {
  item: Connection;
  open: boolean;
  onClose: () => void;
}

export default function LoeschwasserfoerderungPanel({
  item,
  open,
  onClose,
}: LoeschwasserfoerderungPanelProps) {
  const t = useTranslations('loeschwasserfoerderung');
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
          // Über den Leaflet-Steuerelementen (z-index 1000), aber unter einem
          // echten Dialog (1300) — ein Bearbeiten-Dialog soll es verdecken.
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
              {t('title')}
            </Typography>
            <Typography variant="caption" noWrap sx={{ display: 'block' }}>
              {item.name || t('subtitle')}
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

        {/* Bedingt gezeichnet statt in einem `Collapse`: Der Rechner ist eine
            Flex-Spalte mit eigenem Scrollbereich und stehenbleibender Fußzeile,
            und die überlebt den Höhenübergang eines Collapse nicht. Die
            Fußzeile war auch vorher schon ohne Animation. */}
        {!collapsed && <VersorgungRechner item={item} />}
      </Paper>
    </Portal>
  );
}
