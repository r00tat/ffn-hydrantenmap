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

/**
 * Wie oft derselbe Code gelesen sein muss, bevor er gilt, und in welchem
 * Zeitfenster.
 *
 * Der Anlass steht im Einsatz: Zwei Flaschenetiketten in Code 128 kamen als
 * `1016-FL-045` und `2016-FL301` heraus — beide mit gültiger Prüfsumme. Die
 * Prüfsumme von Code 128 fängt einen einzelnen falsch vermessenen Balken
 * sicher ab, zwei nur noch mit etwa 102 zu 103. Bei 10 Bildern je Sekunde,
 * einem kleinen Kamerabild und einem schräg gehaltenen, gekrümmten Etikett
 * fallen genug Fehllesungen an, dass eine davon durchrutscht — und bisher galt
 * der erste Treffer. Fehllesungen sind zufällig und wiederholen sich praktisch
 * nie gleich, eine richtige Lesung schon. Drei gleiche Lesungen kosten bei
 * gutem Bild 0,3 Sekunden.
 */
export const SCAN_CONFIRMATIONS = 3;
export const SCAN_CONFIRMATION_WINDOW_MS = 2000;

/** Eine Lesung, die noch auf ihre Bestätigung wartet — für die Anzeige. */
export interface ScanCandidate {
  value: string;
  format?: string;
  /** Wie oft der Code im Zeitfenster gelesen wurde, diese Lesung mitgezählt. */
  hits: number;
  required: number;
}

/**
 * Zählt gleiche Lesungen über die Bilder hinweg und sagt, wann eine gilt.
 *
 * „Gleich" heißt gleicher Text **und** gleiche Symbologie: Ein Etikett, das
 * einmal als `code_128` und einmal als `code_39` herauskommt, ist ein
 * Widerspruch und keine Bestätigung. Nicht verlangt wird, dass die Lesungen
 * in aufeinanderfolgenden Bildern liegen — zwischen zwei Treffern liefert der
 * Detektor oft ein Bild lang nichts, und eine dazwischengerutschte Fehllesung
 * soll die richtige nicht zurücksetzen.
 *
 * Ohne React und mit der Zeit als Argument, damit die Regel prüfbar bleibt,
 * ohne eine Kamera zu mocken.
 */
export function createScanConfirmation({
  required = SCAN_CONFIRMATIONS,
  windowMs = SCAN_CONFIRMATION_WINDOW_MS,
}: { required?: number; windowMs?: number } = {}) {
  let history: { key: string; at: number }[] = [];
  return {
    push(scan: BarcodeScanEvent, now: number) {
      const key = `${scan.results[0]?.format ?? ''}\u0000${scan.value}`;
      history = history.filter((v) => now - v.at < windowMs);
      history.push({ key, at: now });
      const hits = history.filter((v) => v.key === key).length;
      return { confirmed: hits >= required, hits };
    },
  };
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
  /** Erst für eine bestätigte Lesung, siehe `SCAN_CONFIRMATIONS`. */
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
  /**
   * Die zuletzt gelesene, noch nicht bestätigte Lesung.
   *
   * Ohne sie sähe das Warten auf die Bestätigung aus wie „liest nichts" — und
   * steht hier immer wieder ein anderer Text, liegt das Etikett schlecht im
   * Bild.
   */
  candidate?: ScanCandidate;
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
  const [candidate, setCandidate] = useState<ScanCandidate>();

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
          //
          // Die Auflösung als `ideal`, nicht als Pflicht: Ohne Angabe liefert
          // der Android-WebView 640 × 480. Ein Flaschenetikett in Code 128 ist
          // rund 175 Module lang; liegt es hochkant im Bild, bleiben davon
          // etwa 1,5 Pixel je Modul — zu wenig, um schmale und breite Balken
          // sicher zu trennen. Kann die Kamera kein Full HD, nimmt der
          // Browser das Nächstbeste, statt zu scheitern.
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
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

      // Das Canvas braucht nur ZXing. Der native Detektor liest direkt aus
      // dem Video; ihm jedes Bild erst umzukopieren, kostete bei Full HD
      // zehnmal je Sekunde 8 MB Speicherbewegung für nichts.
      const canvas = Native ? undefined : document.createElement('canvas');
      const ctx = canvas?.getContext('2d');
      const confirmation = createScanConfirmation();
      setEngine(engineInUse);
      setCandidate(undefined);
      setStatus('running');

      let busy = false;
      let geprueft = 0;
      let gemeldeteBreite = 0;
      timer = setInterval(() => {
        // Ohne diese Sperre stapeln sich die Auswertungen, sobald eine länger
        // als das Intervall braucht — auf schwächeren Geräten der Regelfall.
        if (busy || video.readyState < 2) return;
        if (canvas && !ctx) return;
        busy = true;
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (canvas && ctx) {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(video, 0, 0);
        }

        // Die Auflösung steht erst, wenn das erste Bild da ist, und ändert sich
        // danach praktisch nie — deshalb nur beim Wechsel in den State. Dreht
        // sich das Gerät, tauschen Breite und Höhe, und der Rahmen im Dialog
        // muss mit.
        if (width !== gemeldeteBreite) {
          gemeldeteBreite = width;
          setFrameSize({ width, height });
        }
        geprueft += 1;
        // Nur jedes zehnte Bild in den State: Bei 100 ms Takt wäre das sonst
        // zehn Rerender je Sekunde, und die Zahl soll bloß zeigen, dass
        // überhaupt etwas läuft.
        if (geprueft % 10 === 0) setFrames(geprueft);
        void detector
          .detect(canvas ?? video)
          .then((results) => {
            const scan = toScanEvent(results, engineInUse);
            if (!scan || cancelled) return;
            const { confirmed, hits } = confirmation.push(scan, Date.now());
            // Jede Rohlesung ins Protokoll, auch die unbestätigte: Genau die
            // Fehllesungen, die jetzt nicht mehr durchkommen, sollen in einem
            // Bug-Report noch zu sehen sein.
            console.info('Atemschutz-Scan:', {
              engine: scan.engine,
              bild: `${width}x${height}`,
              nachBildern: geprueft,
              value: scan.value,
              bestaetigt: `${hits}/${SCAN_CONFIRMATIONS}`,
              results: scan.results.map(
                (r) => `${r.format ?? 'unbekannt'}: ${r.rawValue}`,
              ),
            });
            if (confirmed) {
              onDetectedRef.current(scan);
              return;
            }
            setCandidate({
              value: scan.value,
              format: scan.results[0]?.format,
              hits,
              required: SCAN_CONFIRMATIONS,
            });
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
    candidate: active ? candidate : undefined,
  };
}
