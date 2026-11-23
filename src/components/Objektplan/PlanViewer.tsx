'use client';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { keyframes } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { textItemBox, type Box as PlanBox } from '../../common/objektplan/melderIndex';
import {
  layoutPages,
  pageAtScroll,
  pagesToRender,
  zoomForMark,
  type PageSize,
  type PlacedPage,
} from '../../common/objektplan/pageLayout';
import {
  objektDokumentKind,
  type ObjektDokument,
} from '../../common/objektplan/objektDokument';
import { loadObjektDokumentBlob } from './objektDokumente';
import { loadPdfjsLib } from './pdfPlanIndex';

export interface PlanViewerProps {
  dokument: ObjektDokument;
  /**
   * Seite (ab 1), zu der gesprungen wird — etwa die eines Suchtreffers.
   * Geblättert wird danach frei durch Scrollen.
   */
  page: number;
  /** Markierungen auf `page`, normiert (Melder). */
  highlights?: PlanBox[];
  /** Suchbegriff, dessen Fundstellen auf `page` markiert werden. */
  textTerm?: string;
  /**
   * Zählt jeden Sprung aus der Suche. Ein neuer Wert springt erneut zum
   * Treffer und zoomt auf ihn — auch wenn Seite und Markierung gleich sind
   * und der Benutzer inzwischen selbst gezoomt oder gescrollt hat.
   */
  jumpKey?: number;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
/**
 * Obergrenze der Canvas-Pixel. iOS verweigert Flächen über rund 16,7 Mio.
 * Pixel; darüber wird mit geringerer Auflösung gerendert und gestreckt.
 */
const MAX_CANVAS_PIXELS = 16_000_000;
/** Kleinste Kantenlänge einer Markierung in px — Melder auf A0-Plänen sind winzig. */
const MIN_MARK_PX = 28;
/** Abstand zwischen den Seiten in px. */
const PAGE_GAP = 8;

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.7); }
  70% { box-shadow: 0 0 0 14px rgba(211, 47, 47, 0); }
  100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0); }
`;

/** Fundstellen eines Begriffs auf einer Seite, über die Textebene von pdfjs. */
async function findTextBoxes(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  term: string,
): Promise<PlanBox[]> {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const { items } = await page.getTextContent();
  const boxes: PlanBox[] = [];
  for (const item of items) {
    if (!('str' in item) || !item.str) continue;
    const text = item.str;
    const haystack = text.toLowerCase();
    let at = haystack.indexOf(needle);
    while (at >= 0) {
      boxes.push(
        textItemBox(
          { transform: item.transform, width: item.width, height: item.height },
          [at / text.length, (at + needle.length) / text.length],
          (x, y) => {
            const [vx, vy] = viewport.convertToViewportPoint(x, y);
            return [vx, vy];
          },
          viewport,
        ),
      );
      at = haystack.indexOf(needle, at + needle.length);
    }
  }
  return boxes;
}

export default function PlanViewer({
  dokument,
  page,
  highlights = [],
  textTerm,
  jumpKey,
}: PlanViewerProps) {
  const t = useTranslations('objektplan');
  const kind = objektDokumentKind(dokument.contentType);

  const scrollRef = useRef<HTMLDivElement>(null);

  const [blob, setBlob] = useState<{ id: string; blob: Blob } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ id: string; doc: PDFDocumentProxy } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  /** Seitengrößen in PDF-Punkten, sobald das PDF offen ist. */
  const [sizes, setSizes] = useState<{ id: string; sizes: PageSize[] } | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 0 });
  const [textBoxes, setTextBoxes] = useState<PlanBox[]>([]);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // Datei laden (Zwischenspeicher zuerst).
  useEffect(() => {
    let current = true;
    loadObjektDokumentBlob(dokument)
      .then((b) => {
        if (current) setBlob({ id: dokument.id, blob: b });
      })
      .catch((err) => {
        console.error('Unterlage konnte nicht geladen werden', err);
        if (current) setLoadError(dokument.id);
      });
    return () => {
      current = false;
    };
  }, [dokument]);

  const currentBlob = blob?.id === dokument.id ? blob.blob : null;

  useEffect(() => {
    if (!currentBlob) return;
    const url = URL.createObjectURL(currentBlob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentBlob]);

  // PDF öffnen.
  useEffect(() => {
    if (!currentBlob || kind !== 'pdf') return;
    let current = true;
    // Aufgeräumt wird über den Ladeauftrag: er gibt Worker und Dokument frei.
    let loadingTask: { destroy(): Promise<void> } | undefined;
    (async () => {
      const pdfjs = await loadPdfjsLib();
      const data = new Uint8Array(await currentBlob.arrayBuffer());
      if (!current) return;
      const task = pdfjs.getDocument({ data });
      loadingTask = task;
      const opened = await task.promise;
      if (current) setPdf({ id: dokument.id, doc: opened });
    })().catch((err) => {
      console.error('PDF konnte nicht geöffnet werden', err);
      if (current) setLoadError(dokument.id);
    });
    return () => {
      current = false;
      loadingTask?.destroy();
    };
  }, [currentBlob, kind, dokument.id]);

  const currentPdf = pdf?.id === dokument.id ? pdf.doc : null;
  const numPages = currentPdf?.numPages ?? dokument.seiten ?? 1;

  // Breite des Bereichs verfolgen: „Seite einpassen" heißt Breite einpassen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
      setScroll((s) => ({ ...s, height: Math.floor(entry.contentRect.height) }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Neues Dokument: wieder eingepasst beginnen.
  useEffect(() => {
    setZoom(1);
  }, [dokument.id]);

  // Größe aller Seiten — billig, rendert nichts, und erlaubt den Aufbau der
  // ganzen Spalte, bevor eine Seite gezeichnet ist.
  useEffect(() => {
    if (!currentPdf) return;
    let current = true;
    Promise.all(
      Array.from({ length: currentPdf.numPages }, (_, i) =>
        currentPdf.getPage(i + 1).then((p) => {
          const v = p.getViewport({ scale: 1 });
          return { width: v.width, height: v.height };
        }),
      ),
    )
      .then((all) => {
        if (current) setSizes({ id: dokument.id, sizes: all });
      })
      .catch((err) => {
        console.error('Seiten konnten nicht gelesen werden', err);
        if (current) setLoadError(dokument.id);
      });
    return () => {
      current = false;
    };
  }, [currentPdf, dokument.id]);

  const pageSizes = sizes?.id === dokument.id ? sizes.sizes : null;
  const layout = useMemo(
    () => layoutPages(pageSizes ?? [], containerWidth, zoom, PAGE_GAP),
    [pageSizes, containerWidth, zoom],
  );
  const targetPage = Math.min(Math.max(page, 1), Math.max(layout.pages.length, 1));
  const currentPage = pageAtScroll(layout, scroll.top, scroll.height);
  const activePages = new Set(pagesToRender(layout, scroll.top, scroll.height));

  const updateScroll = () => {
    const el = scrollRef.current;
    if (el) setScroll({ top: el.scrollTop, height: el.clientHeight });
  };

  // Beim Zoomen die Stelle halten: Spalte wächst, Scrollposition wächst mit.
  const prevTotal = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevTotal.current;
    prevTotal.current = layout.totalHeight;
    if (!el || !prev || !layout.totalHeight || prev === layout.totalHeight) return;
    const ratio = layout.totalHeight / prev;
    el.scrollTop *= ratio;
    el.scrollLeft *= ratio;
    updateScroll();
  }, [layout.totalHeight]);

  const scrollToPage = (n: number) => {
    const target = layout.pages[n - 1];
    scrollRef.current?.scrollTo({ top: target?.top ?? 0, behavior: 'smooth' });
  };

  // Fundstellen des Suchbegriffs auf der Seite.
  useEffect(() => {
    if (!currentPdf || !textTerm) {
      setTextBoxes([]);
      return;
    }
    let current = true;
    findTextBoxes(currentPdf, targetPage, textTerm)
      .then((boxes) => {
        if (current) setTextBoxes(boxes);
      })
      .catch(() => {
        if (current) setTextBoxes([]);
      });
    return () => {
      current = false;
    };
  }, [currentPdf, targetPage, textTerm]);

  const marks = [...highlights, ...textBoxes];

  // Zur Zielseite springen, bei Markierungen auf die erste davon zoomen und
  // sie mittig stellen — sobald die Spalte steht und bei jedem neuen Ziel
  // oder Sprung (`jumpKey`), nicht bei jedem Zoom-Schritt des Benutzers.
  const hasLayout = layout.pages.length > 0;
  /** Sprung, der auf das neue Layout nach dem Zoomen wartet. */
  const pendingJump = useRef<{ page: number; box: PlanBox } | null>(null);

  const centerOn = (pageNumber: number, box: PlanBox, smooth: boolean) => {
    const el = scrollRef.current;
    const target = layout.pages[pageNumber - 1];
    if (!el || !target) return;
    const [x0, y0, x1, y1] = box;
    el.scrollTo({
      left: ((x0 + x1) / 2) * target.width - el.clientWidth / 2,
      top: target.top + ((y0 + y1) / 2) * target.height - el.clientHeight / 2,
      ...(smooth ? { behavior: 'smooth' as const } : {}),
    });
  };

  useEffect(() => {
    const el = scrollRef.current;
    const target = layout.pages[targetPage - 1];
    if (!el || !target) return;
    if (marks.length === 0) {
      if (targetPage > 1) el.scrollTo({ top: target.top });
      return;
    }
    const box = marks[0];
    const wanted = zoomForMark(box, target.height / zoom);
    if (Math.abs(wanted - zoom) < 0.01) {
      centerOn(targetPage, box, true);
      return;
    }
    pendingJump.current = { page: targetPage, box };
    setZoom(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLayout, targetPage, JSON.stringify(marks), jumpKey]);

  // Nach dem Zoom des Sprungs: erst jetzt stehen die neuen Seitenmaße. Läuft
  // nach dem Halten der Stelle oben und setzt die Position endgültig.
  useLayoutEffect(() => {
    const jump = pendingJump.current;
    if (!jump) return;
    pendingJump.current = null;
    centerOn(jump.page, jump.box, false);
    updateScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Strg + Mausrad (auch Pinch am Trackpad) zoomt.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Zwei-Finger-Zoom: während der Geste nur per CSS skaliert, gerendert wird
  // erst beim Loslassen — sonst rendert pdfjs bei jeder Bewegung neu.
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const [pinchScale, setPinchScale] = useState(1);
  const touchDist = (e: React.TouchEvent) =>
    Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );

  const isLoadError = loadError === dokument.id;
  const isLoading = !isLoadError && (!currentBlob || (kind === 'pdf' && !hasLayout));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: 'center',
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        {kind === 'pdf' && (
          <>
            <Tooltip title={t('previousPage')}>
              <span>
                <IconButton
                  size="small"
                  disabled={currentPage <= 1}
                  onClick={() => scrollToPage(currentPage - 1)}
                >
                  <ChevronLeftIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="body2">
              {t('pageOf', { page: currentPage, pages: numPages })}
            </Typography>
            <Tooltip title={t('nextPage')}>
              <span>
                <IconButton
                  size="small"
                  disabled={currentPage >= numPages}
                  onClick={() => scrollToPage(currentPage + 1)}
                >
                  <ChevronRightIcon />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('zoomOut')}>
          <IconButton size="small" aria-label={t('zoomOut')} onClick={() => setZoom((z) => clampZoom(z / 1.4))}>
            <ZoomOutIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="body2" sx={{ minWidth: 44, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title={t('zoomIn')}>
          <IconButton size="small" onClick={() => setZoom((z) => clampZoom(z * 1.4))}>
            <ZoomInIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('fitWidth')}>
          <IconButton size="small" onClick={() => setZoom(1)}>
            <FitScreenIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('openExternal')}>
          <span>
            <IconButton
              size="small"
              disabled={!objectUrl}
              component="a"
              href={objectUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              <OpenInNewIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Box
        ref={scrollRef}
        onScroll={updateScroll}
        onTouchStart={(e) => {
          if (e.touches.length === 2) pinch.current = { dist: touchDist(e), scale: 1 };
        }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || !pinch.current) return;
          const scale = touchDist(e) / pinch.current.dist;
          pinch.current.scale = scale;
          setPinchScale(scale);
        }}
        onTouchEnd={() => {
          if (!pinch.current) return;
          const { scale } = pinch.current;
          pinch.current = null;
          setPinchScale(1);
          setZoom((z) => clampZoom(z * scale));
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
          bgcolor: 'grey.200',
          touchAction: 'pan-x pan-y',
        }}
      >
        {isLoadError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {t('loadFailed')}
          </Alert>
        )}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {kind === 'pdf' && !isLoadError && currentPdf && hasLayout && (
          <Box
            data-testid="plan-pages"
            sx={{
              position: 'relative',
              width: layout.pages[0]?.width,
              height: layout.totalHeight,
              mx: 'auto',
              transform: pinchScale !== 1 ? `scale(${pinchScale})` : undefined,
              transformOrigin: 'top left',
            }}
          >
            {layout.pages.map((placed, i) => (
              <PdfPage
                key={i}
                pdf={currentPdf}
                pageNumber={i + 1}
                placed={placed}
                active={activePages.has(i + 1)}
                marks={i + 1 === targetPage ? marks : []}
              />
            ))}
          </Box>
        )}
        {kind === 'bild' && objectUrl && (
          // Bilder kommen als Blob aus Storage bzw. dem Zwischenspeicher;
          // next/image kann damit nichts anfangen.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectUrl}
            alt={dokument.name}
            style={{
              display: 'block',
              width: containerWidth ? containerWidth * zoom : '100%',
              maxWidth: 'none',
            }}
          />
        )}
      </Box>
    </Box>
  );
}

/**
 * Eine Seite der Spalte. Gezeichnet wird nur, solange sie `active` ist, also
 * in der Nähe des sichtbaren Bereichs; sonst wird die Canvas auf 0 × 0
 * gesetzt und gibt ihren Speicher frei. Der weiße Platzhalter bleibt, damit
 * die Spalte beim Scrollen nicht springt.
 */
function PdfPage({
  pdf,
  pageNumber,
  placed,
  active,
  marks,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  placed: PlacedPage;
  active: boolean;
  marks: PlanBox[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = placed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!active) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let task: RenderTask | undefined;
    let current = true;
    (async () => {
      const pdfPage = await pdf.getPage(pageNumber);
      if (!current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const cssScale = width / base.width;
      const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
      const pixelRatio = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
      const viewport = pdfPage.getViewport({ scale: cssScale * pixelRatio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = pdfPage.render({ canvas, viewport });
      await task.promise;
    })().catch((err: unknown) => {
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
        console.error('Seite konnte nicht gerendert werden', pageNumber, err);
      }
    });
    return () => {
      current = false;
      task?.cancel();
    };
  }, [pdf, pageNumber, width, height, active]);

  const size = { w: width, h: height };
  return (
    <Box
      data-testid="plan-page"
      sx={{ position: 'absolute', top: placed.top, left: 0, width, height, bgcolor: 'common.white' }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width, height }} />
      {marks.map((box, i) => (
        <PlanMark key={i} box={box} size={size} />
      ))}
    </Box>
  );
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function PlanMark({ box, size }: { box: PlanBox; size: { w: number; h: number } }) {
  const [x0, y0, x1, y1] = box;
  const w = Math.max((x1 - x0) * size.w, MIN_MARK_PX);
  const h = Math.max((y1 - y0) * size.h, MIN_MARK_PX);
  const cx = ((x0 + x1) / 2) * size.w;
  const cy = ((y0 + y1) / 2) * size.h;
  return (
    <Box
      data-testid="plan-mark"
      sx={{
        position: 'absolute',
        left: cx - w / 2 - 4,
        top: cy - h / 2 - 4,
        width: w + 8,
        height: h + 8,
        border: '3px solid',
        borderColor: 'error.main',
        borderRadius: 1,
        bgcolor: 'rgba(255, 235, 59, 0.35)',
        pointerEvents: 'none',
        animation: `${pulse} 1.6s ease-out infinite`,
      }}
    />
  );
}
