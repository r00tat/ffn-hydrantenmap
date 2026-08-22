'use client';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useConnections from '../../hooks/useConnections';
import { useFirecall } from '../../hooks/useFirecall';
import type { Connection } from '../firebase/firestore';
import { versorgungSummary } from '../FirecallItems/elements/connection/versorgungSummary';
import {
  LeitungsProvider,
  useLeitungen,
} from '../Map/Leitungen/context';
import VersorgungMap from '../Map/Leitungen/VersorgungMap';
import VersorgungRechner from '../Map/Leitungen/VersorgungRechner';

/**
 * „Löschwasserversorgung" aus der Seitenleiste: Karte links, Auswahl und
 * Rechner rechts.
 *
 * Eine eigene Seite und nicht bloß ein Verweis auf die Karte, weil die Frage
 * „Leitung legen oder pendeln?" vor dem Zeichnen kommt: Man will eine Strecke
 * abstecken, um sie zu rechnen, nicht eine Leitung anlegen, um sie später zu
 * rechnen. Deshalb liegt hier eine eigene, schmale Karte — siehe
 * `VersorgungMap`, die bewusst nicht die Einsatzkarte ist.
 *
 * **Nur mit laufendem Einsatz.** Gezeichnete Leitungen leben im Einsatz; ohne
 * einen gibt es nichts zu listen und nichts zu speichern. Ohne Einsatz steht
 * hier deshalb der Weg zur Einsatzauswahl und nicht ein Rechner, dessen
 * Ergebnis niemand festhalten kann.
 */

export default function Loeschwasserversorgung() {
  const firecall = useFirecall();

  if (!firecall?.id || firecall.id === 'unknown') {
    return <KeinEinsatz />;
  }

  // Der Provider liegt über Karte **und** Spalte: Das Zeichenwerkzeug steckt in
  // der Karte, der Knopf, der es startet, steht in der Liste daneben.
  return (
    <LeitungsProvider>
      <VersorgungInhalt />
    </LeitungsProvider>
  );
}

function KeinEinsatz() {
  const t = useTranslations('loeschwasserversorgung');
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('noFirecall')}
      </Alert>
      <Button component={Link} href="/einsaetze" variant="contained">
        {t('toFirecalls')}
      </Button>
    </Box>
  );
}

function VersorgungInhalt() {
  const t = useTranslations('loeschwasserversorgung');
  const tf = useTranslations('loeschwasserfoerderung');
  const connections = useConnections();
  const leitungen = useLeitungen();
  const [selectedId, setSelectedId] = useState<string>();
  const [seenCreatedId, setSeenCreatedId] = useState<string>();

  // Eine neu gezeichnete Leitung wird von selbst gewählt: Wer zeichnet, will
  // rechnen — sie in der Liste suchen zu lassen wäre ein Schritt zu viel.
  //
  // Angepasst **während des Renderns** und nicht in einem Effekt: React
  // verwirft den halben Durchlauf und rendert sofort neu, ohne den Zwischen-
  // stand je zu zeigen. Ein Effekt gäbe hier eine Kaskade — und einen Frame,
  // in dem die neue Leitung schon da, aber noch nicht gewählt ist.
  //
  // `seenCreatedId` ist der Grund, dass das terminiert: Jede ID wird genau
  // einmal übernommen, danach darf die Auswahl frei wandern.
  if (leitungen.lastCreatedId && leitungen.lastCreatedId !== seenCreatedId) {
    setSeenCreatedId(leitungen.lastCreatedId);
    setSelectedId(leitungen.lastCreatedId);
  }

  const selected = useMemo(
    () => connections.find((connection) => connection.id === selectedId),
    [connections, selectedId]
  );

  const startDrawing = () => {
    // Derselbe Weg wie auf der Karte: Ein Vorlage-Element setzen, dann in den
    // Zeichenmodus. `complete` im Provider schreibt daraus die Leitung.
    leitungen.setFirecallItem({
      type: 'connection',
      name: t('newConnectionName'),
      dimension: 'B',
      // Der Rechner ist an einer Leitung, die zum Rechnen gezeichnet wird,
      // eingeschaltet — sonst müsste man ihn nach dem Zeichnen erst suchen.
      foerderung: 'true',
      streetRouting: 'true',
    } as unknown as Connection);
    leitungen.setIsDrawing(true);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        gap: 2,
        p: 2,
        flex: 1,
        minHeight: 0,
        height: { md: '100%' },
      }}
    >
      <Paper
        sx={{
          flex: { xs: 'none', md: 2 },
          height: { xs: 320, md: 'auto' },
          minHeight: { md: 0 },
          overflow: 'hidden',
        }}
      >
        <VersorgungMap
          connections={connections}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </Paper>

      <Box
        sx={{
          flex: { xs: 'none', md: 1 },
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minWidth: { md: 380 },
          minHeight: 0,
        }}
      >
        <Paper sx={{ p: 2, flexShrink: 0 }}>
          <Typography variant="h6" gutterBottom>
            {t('title')}
          </Typography>

          {leitungen.isDrawing ? (
            <Alert
              severity="info"
              action={
                <Tooltip title={t('cancelDrawing')}>
                  <IconButton
                    size="small"
                    aria-label={t('cancelDrawing')}
                    onClick={() => leitungen.setIsDrawing(false)}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
            >
              {t('drawingHint')}
            </Alert>
          ) : (
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              onClick={startDrawing}
            >
              {t('drawConnection')}
            </Button>
          )}

          {connections.length === 0 && !leitungen.isDrawing && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1.5 }}
            >
              {t('noConnections')}
            </Typography>
          )}

          {connections.length > 0 && (
            <List dense sx={{ maxHeight: 220, overflowY: 'auto', mt: 1 }}>
              {connections.map((connection) => (
                <ListItemButton
                  key={connection.id}
                  selected={connection.id === selectedId}
                  onClick={() =>
                    connection.id && setSelectedId(connection.id)
                  }
                >
                  <ListItemIcon>
                    <WaterDropIcon
                      color={
                        connection.id === selectedId ? 'primary' : 'disabled'
                      }
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={connection.name || tf('subtitle')}
                    secondary={
                      <>
                        {Math.round(connection.distance ?? 0)} m,{' '}
                        {connection.dimension || 'B'}
                        {versorgungSummary(connection) && (
                          <> — {versorgungSummary(connection)}</>
                        )}
                      </>
                    }
                  />
                  {connection.foerderung !== 'true' && (
                    <Chip size="small" label={t('notCalculated')} />
                  )}
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>

        {selected ? (
          <Paper
            key={selected.id}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: { xs: 480, md: 0 },
              overflow: 'hidden',
            }}
          >
            <VersorgungRechner item={selected} />
          </Paper>
        ) : (
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t('selectHint')}
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
