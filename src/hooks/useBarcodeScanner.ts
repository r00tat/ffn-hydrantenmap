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

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
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
        return result ? [{ rawValue: result.getText() }] : [];
      } catch {
        return [];
      }
    },
  };
}

export interface UseBarcodeScannerOptions {
  /** Solange `false`, wird die Kamera nicht angefasst. */
  active: boolean;
  onDetected: (code: string) => void;
}

export interface UseBarcodeScannerResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: ScannerStatus;
  /** Nur bei `status === 'error'` gesetzt. */
  errorMessage?: string;
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

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      setStatus('running');

      let busy = false;
      timer = setInterval(() => {
        // Ohne diese Sperre stapeln sich die Auswertungen, sobald eine länger
        // als das Intervall braucht — auf schwächeren Geräten der Regelfall.
        if (busy || !ctx || video.readyState < 2) return;
        busy = true;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        void detector
          .detect(Native ? video : canvas)
          .then((results) => {
            const code = results[0]?.rawValue?.trim();
            if (code) onDetectedRef.current(code);
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
  };
}
