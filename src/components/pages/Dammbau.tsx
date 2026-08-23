'use client';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import FoundationIcon from '@mui/icons-material/Foundation';
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
import useDammLinien from '../../hooks/useDammLinien';
import { useFirecall } from '../../hooks/useFirecall';
import type { Line } from '../firebase/firestore';
import { dammSumme } from '../FirecallItems/elements/damm/dammSumme';
import { dammbauSummary } from '../FirecallItems/elements/damm/sandsack';
import SandsackRechner from '../Map/Damm/SandsackRechner';
import DammMap from '../Map/Damm/DammMap';
import { LeitungsProvider, useLeitungen } from '../Map/Leitungen/context';
import { round } from '../Map/panelNumbers';

/**
 * „Dammbau" aus der Seitenleiste: Karte links, Auswahl und Sandsackrechner
 * rechts.
 *
 * Eine eigene Seite und nicht bloß ein Verweis auf die Karte, aus demselben
 * Grund wie bei der Löschwasserversorgung: Die Frage „reichen Säcke und Kräfte
 * für diese Strecke?" kommt **vor** dem Zeichnen. Man will eine Dammlinie
 * abstecken, um sie zu rechnen, nicht eine Linie anlegen, um sie später zu
 * rechnen. Deshalb liegt hier eine eigene, schmale Karte — siehe `DammMap`, die
 * bewusst nicht die Einsatzkarte ist.
 *
 * **Nur mit laufendem Einsatz.** Gezeichnete Linien leben im Einsatz; ohne einen
 * gibt es nichts zu listen und nichts zu speichern. Ohne Einsatz steht hier
 * deshalb der Weg zur Einsatzauswahl und nicht ein Rechner, dessen Ergebnis
 * niemand festhalten kann.
 */

export default function Dammbau() {
  const firecall = useFirecall();

  if (!firecall?.id || firecall.id === 'unknown') {
    return <KeinEinsatz />;
  }

  // Der Provider liegt über Karte **und** Spalte: Das Zeichenwerkzeug steckt in
  // der Karte, der Knopf, der es startet, steht in der Liste daneben.
  return (
    <LeitungsProvider>
      <DammbauInhalt />
    </LeitungsProvider>
  );
}

function KeinEinsatz() {
  const t = useTranslations('dammbau');
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {t('pageTitle')}
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

function DammbauInhalt() {
  const t = useTranslations('dammbau');
  const linien = useDammLinien();
  const leitungen = useLeitungen();
  const [selectedId, setSelectedId] = useState<string>();
  const [seenCreatedId, setSeenCreatedId] = useState<string>();

  // Eine neu gezeichnete Dammlinie wird von selbst gewählt: Wer zeichnet, will
  // rechnen — sie in der Liste suchen zu lassen wäre ein Schritt zu viel.
  //
  // Angepasst **während des Renderns** und nicht in einem Effekt: React verwirft
  // den halben Durchlauf und rendert sofort neu, ohne den Zwischenstand je zu
  // zeigen. `seenCreatedId` ist der Grund, dass das terminiert — jede ID wird
  // genau einmal übernommen, danach darf die Auswahl frei wandern. Gleiches
  // Muster wie auf der Seite „Löschwasserversorgung".
  if (leitungen.lastCreatedId && leitungen.lastCreatedId !== seenCreatedId) {
    setSeenCreatedId(leitungen.lastCreatedId);
    setSelectedId(leitungen.lastCreatedId);
  }

  const selected = useMemo(
    () => linien.find((linie) => linie.id === selectedId),
    [linien, selectedId]
  );

  // Die Summe über die gespeicherten Abschnitte. Sie steht **über** der Liste,
  // weil sie die Zahl für die Nachforderung ist — der Rechner unten zeigt sie
  // noch einmal mit den Reglerwerten des gewählten Abschnitts.
  const summe = useMemo(() => dammSumme(linien), [linien]);

  const startDrawing = () => {
    // Derselbe Weg wie auf der Karte: Ein Vorlage-Element setzen, dann in den
    // Zeichenmodus. `complete` im Provider schreibt daraus die Linie.
    leitungen.setFirecallItem({
      type: 'line',
      name: t('newLineName'),
      color: 'brown',
      // Der Rechner ist an einer Linie, die zum Rechnen gezeichnet wird,
      // eingeschaltet — sonst müsste man ihn nach dem Zeichnen erst suchen.
      dammbau: 'true',
    } as unknown as Line);
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
        <DammMap
          linien={linien}
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
            {t('pageTitle')}
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
              {t('drawLine')}
            </Button>
          )}

          {linien.length === 0 && !leitungen.isDrawing && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {t('noLines')}
            </Typography>
          )}

          {/* Der Gesamtbedarf steht neben der Liste und nicht nur im Rechner:
              Nachgefordert wird einmal für die ganze Lage. */}
          {summe && summe.abschnitte.length > 1 && (
            <Alert severity="info" sx={{ mt: 1.5 }} icon={false}>
              <Typography variant="subtitle2">{t('pageTotal')}</Typography>
              <Typography variant="body2">
                {t('totalSections', { count: summe.abschnitte.length })} ·{' '}
                {Math.round(summe.laenge)} {t('unitM')} ·{' '}
                {summe.saeckeBestellen} {t('materialBags')} ·{' '}
                {round(summe.sandMasse)} {t('unitT')} {t('materialSand')} ·{' '}
                {summe.fuhren} {t('trucks')}
              </Typography>
            </Alert>
          )}

          {linien.length > 0 && (
            <List dense sx={{ maxHeight: 220, overflowY: 'auto', mt: 1 }}>
              {linien.map((linie) => (
                <ListItemButton
                  key={linie.id}
                  selected={linie.id === selectedId}
                  onClick={() => linie.id && setSelectedId(linie.id)}
                >
                  <ListItemIcon>
                    <FoundationIcon
                      color={linie.id === selectedId ? 'primary' : 'disabled'}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={linie.name || t('subtitle')}
                    secondary={
                      <>
                        {Math.round(linie.distance ?? 0)} m
                        {dammbauSummary(linie) && (
                          <> — {dammbauSummary(linie)}</>
                        )}
                      </>
                    }
                  />
                  {linie.dammbau !== 'true' && (
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
            <SandsackRechner item={selected} />
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
