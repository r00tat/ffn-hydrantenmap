'use client';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  geraetKennung,
  type AtemschutzGeraet,
} from '../../common/atemschutz';
import type { BarcodeScanEvent } from '../../hooks/useBarcodeScanner';
import ScanHinweis from './ScanHinweis';

export interface GeraetBestaetigungProps {
  geraet: AtemschutzGeraet;
  /** Hakerl davor — dort, wo gerade eben ausgewählt oder gescannt wurde. */
  bestaetigt?: boolean;
  /**
   * Die Rohlesung, wenn das Stück gescannt wurde.
   *
   * Sie steht hier und nicht im Scanner-Dialog, weil der sich bei einem
   * eindeutigen Treffer sofort schließt: Wer prüfen will, ob das gezeigte Stück
   * wirklich das gescannte ist, sieht beides erst hier nebeneinander.
   */
  scan?: BarcodeScanEvent;
}

/**
 * Welches Stück gewählt ist — groß genug, um es im Stehen zu lesen.
 *
 * Vorher stand das als Hilfstext unter dem Feld: 12 px, grau. Am Sammelplatz
 * wird mit Handschuhen bei Tageslicht auf ein Handy geschaut, und die
 * Verwechslung zweier Flaschen desselben Typs ist genau der Fehler, den das
 * Protokoll verhindern soll. Die Kennung steht deshalb in Überschriftgröße,
 * die Bezeichnung darunter im Fließtext.
 */
export default function GeraetBestaetigung({
  geraet,
  bestaetigt,
  scan,
}: GeraetBestaetigungProps) {
  const kennung = geraetKennung(geraet);
  const details = [geraet.feuerwehr, geraet.inventarNr, geraet.seriennummer]
    .filter(Boolean)
    .join(' · ');

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderColor: bestaetigt ? 'success.main' : 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        {bestaetigt && <CheckCircleIcon color="success" fontSize="large" />}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, lineHeight: 1.2, wordBreak: 'break-word' }}
          >
            {kennung ?? geraet.bezeichnung}
          </Typography>
          {/* Nur wenn es eine Kennung gibt — sonst stünde die Bezeichnung
              zweimal untereinander. */}
          {kennung && (
            <Typography variant="body1">{geraet.bezeichnung}</Typography>
          )}
          {details && (
            <Typography variant="body2" color="text.secondary">
              {details}
            </Typography>
          )}
          {scan && <ScanHinweis scan={scan} />}
        </Box>
      </Stack>
    </Paper>
  );
}
