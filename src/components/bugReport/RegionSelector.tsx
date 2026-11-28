'use client';

import CheckIcon from '@mui/icons-material/Check';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Modal from '@mui/material/Modal';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSnackbar } from '../providers/SnackbarProvider';
import {
  MIN_SELECTION_PX,
  Point,
  Rect,
  Size,
  clampRect,
  containRect,
  cropImageBlob,
  mapSelectionToImage,
  normalizeRect,
} from './cropImage';

export interface RegionSelectorProps {
  open: boolean;
  /** Eingefrorene Aufnahme, auf der ausgewählt wird. */
  image: Blob | null;
  /**
   * `capture`: frische Aufnahme, der Ausweichknopf heißt „Ganzer Bildschirm".
   * `crop`: ein schon angehängter Screenshot wird zugeschnitten.
   */
  mode?: 'capture' | 'crop';
  /** Zugeschnittenes Bild oder — bei „Ganzer Bildschirm" — `image` selbst. */
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

/**
 * Bereichsauswahl auf einer eingefrorenen Bildschirmaufnahme.
 *
 * Ausgewählt wird auf einem Bild, nicht über der lebenden Seite: So bleibt
 * genau der Zustand stehen, der gemeldet werden soll, und das Aufziehen mit
 * dem Finger löst darunter nichts aus (Karte verschieben, Dialog schließen).
 *
 * Ein MUI-`Modal` und kein einfaches Overlay, weil darunter oft ein anderer
 * Dialog offen ist: Der ModalManager lässt nur das oberste Modal den Fokus
 * festhalten, ein bloßes `fixed`-Element verlöre den Fokus an dessen
 * Focus-Trap. `data-skip-screenshot` hält es aus weiteren Aufnahmen heraus,
 * `data-hotkeys-block` sperrt andere Tastenkürzel. Siehe docs/bug-reports.md.
 */
export default function RegionSelector({ open, image, ...rest }: RegionSelectorProps) {
  const imageUrl = useMemo(
    () => (open && image ? URL.createObjectURL(image) : null),
    [open, image],
  );
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  if (!image || !imageUrl) return null;
  // Neues Bild → frischer Zustand (Auswahl, Maße) über den Key.
  return <RegionSelectorModal key={imageUrl} image={image} imageUrl={imageUrl} {...rest} />;
}

interface RegionSelectorModalProps extends Omit<RegionSelectorProps, 'open' | 'image'> {
  image: Blob;
  imageUrl: string;
}

function RegionSelectorModal({
  image,
  imageUrl,
  mode = 'capture',
  onConfirm,
  onCancel,
}: RegionSelectorModalProps) {
  const t = useTranslations('bugReport');
  const showSnackbar = useSnackbar();

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; start: Point } | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  // Größe der Fläche beim letzten Ziehen, für die Darstellung der Auswahl.
  const [surfaceSize, setSurfaceSize] = useState<Size | null>(null);
  // Angezeigte Pixel relativ zur Fläche; während des Ziehens wird sie laufend
  // ersetzt, nach dem Loslassen bleibt sie stehen.
  const [selection, setSelection] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cropping, setCropping] = useState(false);

  // Ändert sich die Fläche (Drehen, Fenstergröße), passt die Auswahl in
  // angezeigten Pixeln nicht mehr zum Bild.
  useEffect(() => {
    const reset = () => setSelection(null);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);

  const surfaceBox = useCallback((): DOMRect | null => {
    return surfaceRef.current?.getBoundingClientRect() ?? null;
  }, []);

  /** Punkt relativ zur Fläche, auf den sichtbaren Bildbereich begrenzt. */
  const toLocalPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const box = surfaceBox();
      if (!box || !natural) return null;
      const content = containRect(box, natural);
      const x = clientX - box.left;
      const y = clientY - box.top;
      return {
        x: Math.min(content.x + content.width, Math.max(content.x, x)),
        y: Math.min(content.y + content.height, Math.max(content.y, y)),
      };
    },
    [natural, surfaceBox],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || cropping) return;
    const start = toLocalPoint(event.clientX, event.clientY);
    if (!start) return;
    const box = surfaceBox();
    if (box) setSurfaceSize({ width: box.width, height: box.height });
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Ohne Capture endet ein Ziehen über den Rand eben dort.
    }
    dragRef.current = { pointerId: event.pointerId, start };
    setDragging(true);
    setSelection({ ...start, width: 0, height: 0 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = toLocalPoint(event.clientX, event.clientY);
    if (!point) return;
    setSelection(normalizeRect(drag.start, point));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const point = toLocalPoint(event.clientX, event.clientY) ?? drag.start;
    const rect = normalizeRect(drag.start, point);
    // Antippen statt Aufziehen: Auswahl verwerfen.
    setSelection(rect.width >= MIN_SELECTION_PX && rect.height >= MIN_SELECTION_PX ? rect : null);
  };

  const hasRegion = !dragging && selection !== null;

  const handleConfirm = useCallback(async () => {
    if (!selection || !natural || cropping) return;
    const box = surfaceBox();
    if (!box) return;
    const rect = mapSelectionToImage(selection, box, natural);
    if (!rect) {
      setSelection(null);
      return;
    }
    setCropping(true);
    const cropped = await cropImageBlob(image, rect);
    setCropping(false);
    if (!cropped) {
      showSnackbar(t('regionCropFailed'), 'error');
      return;
    }
    onConfirm(cropped);
  }, [cropping, image, natural, onConfirm, selection, showSnackbar, surfaceBox, t]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Enter auf einem Knopf löst dessen Klick aus — nicht zusätzlich bestätigen.
    if (event.key !== 'Enter') return;
    if ((event.target as HTMLElement).closest?.('button')) return;
    event.preventDefault();
    if (hasRegion) void handleConfirm();
  };

  const visibleSelection = useMemo(() => {
    if (!selection) return null;
    if (!surfaceSize || !natural) return selection;
    return clampRect(selection, containRect(surfaceSize, natural));
  }, [natural, selection, surfaceSize]);

  return (
    <Modal
      open
      onClose={(_event, reason) => {
        if (reason === 'escapeKeyDown' && !cropping) onCancel();
      }}
      // Kein Scroll-Lock: das Polster für die Scrollbar verschöbe die Seite.
      disableScrollLock
      hideBackdrop
      data-testid="region-selector"
      data-skip-screenshot="true"
      data-hotkeys-block="true"
      sx={{ zIndex: (theme) => theme.zIndex.modal + 20 }}
      aria-labelledby="bug-report-region-title"
    >
      <Box
        data-testid="region-selector-content"
        onKeyDown={handleKeyDown}
        sx={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'grey.900',
          outline: 'none',
          pt: 'env(safe-area-inset-top, 0px)',
          pb: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <Box sx={{ px: 2, py: 1, color: 'common.white' }}>
          <Typography id="bug-report-region-title" variant="subtitle1">
            {t('regionTitle')}
          </Typography>
          <Typography variant="caption" component="div" sx={{ opacity: 0.8 }}>
            {t('regionHint')}
          </Typography>
        </Box>

        <Box
          ref={surfaceRef}
          data-testid="region-surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          sx={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            // Sonst scrollt oder zoomt der Browser beim Ziehen mit dem Finger.
            touchAction: 'none',
            userSelect: 'none',
            cursor: 'crosshair',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={t('regionImageAlt')}
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget;
              setNatural({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
          {visibleSelection ? (
            <Box
              sx={{
                position: 'absolute',
                left: visibleSelection.x,
                top: visibleSelection.y,
                width: visibleSelection.width,
                height: visibleSelection.height,
                outline: '2px dashed #fff',
                // Abdunkeln außerhalb der Auswahl, die Fläche schneidet ab.
                boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.55)',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'rgba(0, 0, 0, 0.35)',
                pointerEvents: 'none',
              }}
            />
          )}
        </Box>

        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            px: 2,
            py: 1,
            bgcolor: 'background.paper',
          }}
        >
          <Button onClick={onCancel} disabled={cropping}>
            {t('regionCancel')}
          </Button>
          <Button
            startIcon={<FullscreenIcon />}
            variant="outlined"
            disabled={cropping}
            onClick={() => onConfirm(image)}
          >
            {mode === 'crop' ? t('regionKeepWhole') : t('regionFullScreen')}
          </Button>
          <Button
            startIcon={<CheckIcon />}
            variant="contained"
            disabled={!hasRegion || cropping}
            onClick={() => void handleConfirm()}
          >
            {t('regionConfirm')}
          </Button>
        </Stack>
      </Box>
    </Modal>
  );
}
