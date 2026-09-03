'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Die Symbologien, die an Atemluftflaschen vorkommen.
 *
 * Code 128 und Code 39 sind die üblichen Etiketten, EAN-13 kommt aus dem
 * Herstellerkarton (und bezeichnet den Artikeltyp, nicht das Stück), QR und
 * DataMatrix stehen auf selbst gedruckten Etiketten.
 */
export const BARCODE_FORMATS = [
  'code_128',
  'code_39',
  'ean_13',
  'qr_code',
  'data_matrix',
] as const;

export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'unsupported'
  | 'denied'
  | 'error';

/**
 * Welcher Detektor gelesen hat.
 *
 * Der Unterschied ist keine Feinheit: Die beiden Engines gewichten dieselben
 * Symbologien verschieden, und ein Fehllesen ist deshalb je nach Engine anders
 * zu erklären. Wer ein Scan-Protokoll deutet, muss wissen, welche es war.
 */
export type ScannerEngine = 'native' | 'zxing';

/**
 * Ein Rohtreffer des Detektors: der gelesene Text und die Symbologie, in der
 * er gelesen wurde.
 *
 * Das Format steht hier, weil es sonst nirgends ankommt — und ohne das Format
 * sieht man am Ende nur einen Code, der kein Gerät trifft, und sucht an der
 * falschen Stelle. Ein Etikett in Code 128, das als `code_39` gemeldet wird,
 * ist ein Fehllesen und keine unbekannte Flasche.
 */
export interface BarcodeScan {
  rawValue: string;
  /**
   * `code_128`, `code_39`, `qr_code` … in der Schreibweise des nativen
   * Detektors. Fehlt, wenn der Detektor keines meldet.
   */
  format?: string;
}

/** Was ein einzelnes Kamerabild geliefert hat. */
export interface BarcodeScanEvent {
  /** Der übernommene Text: der erste Rohtreffer, getrimmt. */
  value: string;
  /**
   * Alle Rohtreffer des Bildes, in der Reihenfolge des Detektors.
   *
   * Übernommen wird `results[0]`; die übrigen stehen trotzdem hier, weil genau
   * sie den Fehlgriff zeigen. Liest der native Detektor dasselbe Etikett
   * zugleich als `code_128` und als `code_39`, entscheidet allein die
   * Reihenfolge — und die sieht man sonst nirgends.
   *
   * Der ZXing-Fallback liefert hier immer genau einen Eintrag: Sein
   * `MultiFormatReader` bricht beim ersten Leser ab, der etwas herausbekommt.
   */
  results: BarcodeScan[];
  engine: ScannerEngine;
}

/**
 * Ein Formatname in der Schreibweise des nativen Detektors: `QR_CODE` →
 * `qr_code`.
 *
 * ZXing meldet ein Enum, der native `BarcodeDetector` einen Kleinschrift-String.
 * Beide sollen dasselbe Vokabular sprechen, sonst hinge die Deutung eines
 * Protokolls daran, auf welchem Gerät es entstanden ist.
 */
export function normalizeFormatName(name?: string | number): string | undefined {
  return typeof name === 'string' && name ? name.toLowerCase() : undefined;
}

/**
 * Der Treffer eines Bildes, so wie ihn der Aufrufer sieht — oder `undefined`,
 * wenn nichts Brauchbares dabei war.
 *
 * Eigenständig und ohne React, damit die Regel „der erste Rohtreffer gewinnt"
 * prüfbar bleibt, ohne eine Kamera zu mocken.
 */
export function toScanEvent(
  results: BarcodeScan[],
  engine: ScannerEngine,
): BarcodeScanEvent | undefined {
  const value = results[0]?.rawValue?.trim();
  if (!value) return undefined;
  return { value, results, engine };
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<BarcodeScan[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

function nativeDetector(): BarcodeDetectorCtor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
}

/**
 * Lädt den ZXing-Fallback — erst hier, und nur einmal.
 *
 * Der dynamische Import ist der Kern der Konstruktion: Auf Android liefert
 * `BarcodeDetector` das Ergebnis nativ, und die Bibliothek wird dort nie
 * angefasst. Nur iOS-Safari zahlt für sie.
 */
async function zxingDetector(): Promise<BarcodeDetectorLike> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
    await Promise.all([import('@zxing/browser'), import('@zxing/library')]);

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new BrowserMultiFormatReader(hints);

  return {
    async detect(source) {
      // ZXing liest aus einem Canvas; der Aufrufer zeichnet das Videobild
      // bereits dorthin. `decodeFromCanvas` wirft, wenn nichts gefunden wird —
      // das ist der Normalfall zwischen zwei Treffern, kein Fehler.
      try {
        const result = reader.decodeFromCanvas(source as HTMLCanvasElement);
        if (!result) return [];
        return [
          {
            rawValue: result.getText(),
            // Über die Rücklookup-Seite des Enums: `BarcodeFormat[2]` ist
            // `'CODE_39'`. Ohne diesen Namen stünde im Protokoll eine Zahl,
            // mit der niemand am Sammelplatz etwas anfangen kann.
            format: normalizeFormatName(BarcodeFormat[result.getBarcodeFormat()]),
          },
        ];
      } catch {
        return [];
      }
    },
  };
}

export interface UseBarcodeScannerOptions {
  /** Solange `false`, wird die Kamera nicht angefasst. */
  active: boolean;
  onDetected: (scan: BarcodeScanEvent) => void;
}

export interface UseBarcodeScannerResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: ScannerStatus;
  /** Nur bei `status === 'error'` gesetzt. */
  errorMessage?: string;
  /** Steht, sobald der Detektor gebaut ist — auch vor dem ersten Treffer. */
  engine?: ScannerEngine;
  /**
   * Die Auflösung, in der ausgewertet wird — die des Videobildes.
   *
   * Sie entscheidet mit, ob ein Etikett überhaupt lesbar ist: Ein Strichcode
   * braucht Pixel je Modul, und was die Kamera von sich aus liefert, reicht
   * dafür nicht immer. Ohne diese Zahl ist „er liest nichts" nicht von „er
   * liest falsch" zu unterscheiden.
   */
  frameSize?: { width: number; height: number };
  /**
   * Wie viele Bilder bereits ausgewertet wurden.
   *
   * Steigt die Zahl, ohne dass ein Treffer kommt, läuft die Kamera und der
   * Decoder findet schlicht nichts — ein Zustand, der sonst wie ein Hänger
   * aussieht.
   */
  frames: number;
}

/** Wie oft ein Einzelbild ausgewertet wird. 100 ms reicht für die Hand. */
const SCAN_INTERVAL_MS = 100;

export default function useBarcodeScanner({
  active,
  onDetected,
}: UseBarcodeScannerOptions): UseBarcodeScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [engine, setEngine] = useState<ScannerEngine>();
  const [frameSize, setFrameSize] = useState<{ width: number; height: number }>();
  const [frames, setFrames] = useState(0);

  // Über eine Ref, damit ein neu erzeugter Callback des Aufrufers nicht die
  // Kamera neu startet — das ließe das Bild bei jedem Tastendruck flackern.
  //
  // Nachgezogen im Effekt und nicht im Render: Eine Ref während des Renderns
  // zu beschreiben ist ein Seiteneffekt, den React 19 im Strict Mode zweimal
  // ausführt (`react-hooks/refs`). Der Startwert steht bereits in `useRef`,
  // der erste Scan trifft also nie einen veralteten Callback.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback((stream?: MediaStream) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    // Kein `setStatus('idle')` hier: Ein synchroner setState im Effekt-Rumpf
    // löst eine zusätzliche Renderrunde aus (`react-hooks/set-state-in-effect`).
    // Der Ruhezustand wird stattdessen bei der Rückgabe abgeleitet — er hängt
    // ohnehin nur an `active`.
    if (!active) return;

    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    (async () => {
      setStatus('starting');
      setErrorMessage(undefined);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        setStatus('unsupported');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Die rückwärtige Kamera: Wer eine Flasche scannt, hält das Gerät
          // von sich weg.
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setStatus(name === 'NotAllowedError' ? 'denied' : 'error');
        setErrorMessage((err as Error)?.message);
        return;
      }
      if (cancelled) {
        stop(stream);
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stop(stream);
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const Native = nativeDetector();
      const engineInUse: ScannerEngine = Native ? 'native' : 'zxing';
      let detector: BarcodeDetectorLike;
      try {
        detector = Native
          ? new Native({ formats: [...BARCODE_FORMATS] })
          : await zxingDetector();
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage((err as Error)?.message);
        stop(stream);
        return;
      }
      if (cancelled) {
        stop(stream);
        return;
      }

      // Einmal beim Start: welcher Detektor liest und welche Symbologien er
      // überhaupt kann. Der native Detektor nimmt die Formatliste entgegen,
      // ohne sich zu beschweren, wenn er eine davon nicht beherrscht — dann
      // wird schlicht nie danach gesucht, und das sieht man ihm nicht an.
      // `console.info` genügt: `useFirebaseDebugging` hängt sich in `console.*`
      // ein, der Eintrag landet also von selbst im Bug-Report, sobald jemand
      // „Debug Informationen anzeigen" eingeschaltet hat.
      const unterstuetzt = await Native?.getSupportedFormats?.().catch(
        () => undefined,
      );
      console.info('Atemschutz-Scanner bereit:', {
        engine: engineInUse,
        angefragt: [...BARCODE_FORMATS],
        unterstuetzt,
      });
      if (cancelled) {
        stop(stream);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      setEngine(engineInUse);
      setStatus('running');

      let busy = false;
      let geprueft = 0;
      let gemeldeteBreite = 0;
      timer = setInterval(() => {
        // Ohne diese Sperre stapeln sich die Auswertungen, sobald eine länger
        // als das Intervall braucht — auf schwächeren Geräten der Regelfall.
        if (busy || !ctx || video.readyState < 2) return;
        busy = true;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // Die Auflösung steht erst, wenn das erste Bild da ist, und ändert sich
        // danach praktisch nie — deshalb nur beim Wechsel in den State.
        if (canvas.width !== gemeldeteBreite) {
          gemeldeteBreite = canvas.width;
          setFrameSize({ width: canvas.width, height: canvas.height });
        }
        geprueft += 1;
        // Nur jedes zehnte Bild in den State: Bei 100 ms Takt wäre das sonst
        // zehn Rerender je Sekunde, und die Zahl soll bloß zeigen, dass
        // überhaupt etwas läuft.
        if (geprueft % 10 === 0) setFrames(geprueft);
        void detector
          .detect(Native ? video : canvas)
          .then((results) => {
            const scan = toScanEvent(results, engineInUse);
            if (!scan) return;
            console.info('Atemschutz-Scan:', {
              engine: scan.engine,
              bild: `${canvas.width}x${canvas.height}`,
              nachBildern: geprueft,
              value: scan.value,
              results: scan.results.map(
                (r) => `${r.format ?? 'unbekannt'}: ${r.rawValue}`,
              ),
            });
            onDetectedRef.current(scan);
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false;
          });
      }, SCAN_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stop(stream);
    };
  }, [active, stop]);

  // Solange der Scanner nicht aktiv ist, gilt `idle` — unabhängig davon, womit
  // ein vorheriger Lauf geendet hat.
  return {
    videoRef,
    status: active ? status : 'idle',
    errorMessage: active ? errorMessage : undefined,
    engine: active ? engine : undefined,
    frameSize: active ? frameSize : undefined,
    frames: active ? frames : 0,
  };
}
