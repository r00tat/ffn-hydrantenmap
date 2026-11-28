'use client';

import { useTranslations } from 'next-intl';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHotkey } from '../hotkeys/HotkeyProvider';
import { useSnackbar } from '../providers/SnackbarProvider';
import BugReportDialog from './BugReportDialog';
import { captureScreenshot } from './captureScreenshot';
import RegionSelector from './RegionSelector';
import ScreenshotCaptureOverlay from './ScreenshotCaptureOverlay';

export interface BugReportContextValue {
  /** Öffnet den Dialog ohne Screenshot (Menüeintrag „Bug melden"). */
  open: () => void;
  /**
   * Nimmt zuerst den aktuellen Bildschirm auf — samt eines gerade offenen
   * Dialogs — und öffnet dann den Bug-Report mit diesem Screenshot.
   */
  openWithScreenshot: () => Promise<void>;
  /**
   * Nimmt den Bildschirm auf, lässt einen Bereich darauf auswählen und öffnet
   * den Bug-Report mit dem Ausschnitt.
   */
  openRegionSelect: () => Promise<void>;
}

const noopAsync = async () => {};

const BugReportContext = createContext<BugReportContextValue>({
  open: () => {},
  openWithScreenshot: noopAsync,
  openRegionSelect: noopAsync,
});

export function useBugReport(): BugReportContextValue {
  return useContext(BugReportContext);
}

type Phase = 'idle' | 'capturing' | 'selecting';

/**
 * Hält den Bug-Report-Dialog und die beiden Tastenkürzel.
 *
 * Die Kürzel nehmen den Screenshot auf, *bevor* der Dialog aufgeht: Wer über
 * einem anderen Dialog den Menüeintrag sucht, schließt diesen Dialog — genau
 * der Zustand, um den es im Report geht, wäre weg. Ist der Bug-Report schon
 * offen, übernimmt er `bugReport.region` selbst (er meldet sich danach an und
 * hat damit Vorrang), `bugReport.open` tut dann nichts.
 * Siehe docs/bug-reports.md.
 */
export default function BugReportProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('bugReport');
  const showSnackbar = useSnackbar();

  const [isOpen, setIsOpen] = useState(false);
  const [initialScreenshots, setInitialScreenshots] = useState<Blob[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [regionImage, setRegionImage] = useState<Blob | null>(null);

  // Synchron lesbar für die Kürzel-Handler: ein zweiter Tastendruck vor dem
  // nächsten Rendern darf keine zweite Aufnahme starten.
  const busyRef = useRef(false);
  const isOpenRef = useRef(false);
  // Hochgezählt bei jedem Start und beim Abbrechen; eine Aufnahme, die nach
  // dem Abbrechen fertig wird, verfällt.
  const runRef = useRef(0);

  const openDialog = useCallback((screenshots: Blob[]) => {
    isOpenRef.current = true;
    setInitialScreenshots(screenshots);
    setIsOpen(true);
  }, []);

  const open = useCallback(() => {
    if (isOpenRef.current || busyRef.current) return;
    openDialog([]);
  }, [openDialog]);

  const handleClose = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    setInitialScreenshots([]);
  }, []);

  const finish = useCallback(() => {
    busyRef.current = false;
    setPhase('idle');
    setRegionImage(null);
  }, []);

  /** `undefined` = abgebrochen, `null` = fehlgeschlagen. */
  const capture = useCallback(async (highResolution: boolean): Promise<Blob | null | undefined> => {
    const run = (runRef.current += 1);
    busyRef.current = true;
    setPhase('capturing');
    let blob: Blob | null = null;
    try {
      blob = await captureScreenshot({ highResolution });
    } catch (err) {
      // z.B. der nachgeladene Chunk ist offline nicht verfügbar.
      console.warn('bug-report: screenshot capture threw', err);
    }
    if (runRef.current !== run) return undefined;
    return blob;
  }, []);

  const openWithScreenshot = useCallback(async () => {
    if (isOpenRef.current || busyRef.current) return;
    const blob = await capture(false);
    if (blob === undefined) return;
    finish();
    if (!blob) showSnackbar(t('screenshotFailed'), 'error');
    // Auch ohne Bild öffnen: der Report selbst ist wichtiger als der Anhang.
    openDialog(blob ? [blob] : []);
  }, [capture, finish, openDialog, showSnackbar, t]);

  const openRegionSelect = useCallback(async () => {
    if (isOpenRef.current || busyRef.current) return;
    const blob = await capture(true);
    if (blob === undefined) return;
    if (!blob) {
      finish();
      showSnackbar(t('screenshotFailed'), 'error');
      return;
    }
    setRegionImage(blob);
    setPhase('selecting');
  }, [capture, finish, showSnackbar, t]);

  const handleCancelCapture = useCallback(() => {
    runRef.current += 1;
    finish();
  }, [finish]);

  const handleRegionConfirm = useCallback(
    (blob: Blob) => {
      finish();
      openDialog([blob]);
    },
    [finish, openDialog],
  );

  // Ist der Bug-Report offen, hat dessen eigener Handler Vorrang; landet ein
  // Tastendruck doch hier, wird er verschluckt statt woanders zu wirken.
  useHotkey('bugReport.open', () => {
    void openWithScreenshot();
  });
  useHotkey('bugReport.region', () => {
    void openRegionSelect();
  });

  const value = useMemo<BugReportContextValue>(
    () => ({ open, openWithScreenshot, openRegionSelect }),
    [open, openWithScreenshot, openRegionSelect],
  );

  return (
    <BugReportContext.Provider value={value}>
      {children}
      <ScreenshotCaptureOverlay
        open={phase === 'capturing'}
        onCancel={handleCancelCapture}
        variant="hotkey"
      />
      <RegionSelector
        open={phase === 'selecting'}
        image={regionImage}
        onConfirm={handleRegionConfirm}
        onCancel={finish}
      />
      <BugReportDialog
        open={isOpen}
        onClose={handleClose}
        initialScreenshots={initialScreenshots}
      />
    </BugReportContext.Provider>
  );
}
