'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type {
  BarcodeScan,
  BarcodeScanEvent,
  ScannerEngine,
} from '../../hooks/useBarcodeScanner';

/**
 * Der Name eines Detektors, wie er am Bildschirm steht.
 *
 * Getrennt von der Anzeige, weil beide Komponenten dieses Moduls ihn brauchen.
 */
function useEngineLabel() {
  const t = useTranslations('atemschutz');
  return (engine?: ScannerEngine) =>
    engine === 'native'
      ? t('scanner.engineNative')
      : engine === 'zxing'
        ? t('scanner.engineZxing')
        : t('scanner.engineUnknown');
}

export interface ScanHinweisProps {
  scan: BarcodeScanEvent;
}

/**
 * Was der Scanner tatsächlich gelesen hat: Text, Symbologie und Detektor.
 *
 * Steht dauerhaft und für alle da, nicht hinter einem Debug-Schalter. Wer am
 * Sammelplatz ein Gerät vorgeschlagen bekommt, das nicht zur Flasche in der
 * Hand passt, soll auf demselben Bildschirm entscheiden können, woran es liegt:
 * Ein Etikett in Code 128, das als `code_39` gemeldet wird, ist ein Fehllesen;
 * steht dort der richtige Text, wurde er nur falsch aufgelöst. Ohne das Format
 * sind die beiden Fälle nicht zu trennen, und man sucht an der falschen Stelle.
 *
 * Die Zeile reist mit dem Treffer weiter: Bei einem eindeutigen Gerät schließt
 * sich der Scanner sofort, und sie erscheint im Folgedialog an der
 * Gerätebestätigung — dort, wo die Entscheidung tatsächlich fällt.
 */
export default function ScanHinweis({ scan }: ScanHinweisProps) {
  const t = useTranslations('atemschutz');
  const engineLabel = useEngineLabel();

  const beschreibe = (r: BarcodeScan) =>
    `„${r.rawValue}“ · ${r.format ?? t('scanner.formatUnknown')}`;

  // Der erste Rohtreffer ist der übernommene; die übrigen zeigen, ob der
  // Detektor im selben Bild noch etwas anderes gesehen hat.
  const weitere = scan.results.slice(1).filter((r) => r.rawValue.trim());

  return (
    <Box>
      <Typography variant="body2" component="div">
        {t('scanner.read', {
          code: scan.value,
          format: scan.results[0]?.format ?? t('scanner.formatUnknown'),
        })}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {t('scanner.engine', { engine: engineLabel(scan.engine) })}
        {weitere.length > 0 &&
          ` · ${t('scanner.alsoRead', {
            list: weitere.map(beschreibe).join(', '),
          })}`}
      </Typography>
    </Box>
  );
}

export interface ScanLaufProps {
  engine?: ScannerEngine;
  /** Die Auflösung, in der ausgewertet wird. */
  frameSize?: { width: number; height: number };
  frames: number;
}

/**
 * Der laufende Scan, solange noch nichts gelesen wurde.
 *
 * „Kamera läuft, Decoder findet nichts" sah bisher aus wie ein Hänger: Das Bild
 * steht, und sonst passiert nichts. Die Zahl der geprüften Bilder unterscheidet
 * den Fall von einer eingefrorenen Kamera, die Auflösung erklärt ihn — ein
 * Strichcode braucht Pixel je Modul, und was `getUserMedia` von sich aus
 * liefert, reicht dafür nicht immer.
 */
export function ScanLauf({ engine, frameSize, frames }: ScanLaufProps) {
  const t = useTranslations('atemschutz');
  const engineLabel = useEngineLabel();

  return (
    <Typography variant="caption" color="text.secondary" component="div">
      {t('scanner.progress', {
        engine: engineLabel(engine),
        size: frameSize
          ? `${frameSize.width} × ${frameSize.height}`
          : t('scanner.frameUnknown'),
        frames,
      })}
    </Typography>
  );
}
