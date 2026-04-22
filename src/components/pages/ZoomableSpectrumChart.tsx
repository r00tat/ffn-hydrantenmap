'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useDrawingArea } from '@mui/x-charts/hooks';
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  nuclidesAtEnergy,
  type NuclideAtEnergy,
} from '../../common/nuclidesAtEnergy';
import { channelToEnergy } from '../../common/spectrumParser';
import {
  applyPan,
  applyWheelZoom,
  resetRange,
  type Range,
} from './zoomState';

/**
 * Props for ZoomableSpectrumChart.
 *
 * The chart is driven either by a single `counts + coefficients` pair (simple
 * case — most live-spectrum usages) or by pre-computed `series + energies`
 * (multi-series comparison view). The zoom/pan/hover behaviour is identical.
 */
export interface ZoomableSpectrumChartProps {
  /** Single-spectrum input: raw channel counts. */
  counts?: number[];
  /** Polynomial calibration coefficients (E = c0 + c1*ch + c2*ch² …). */
  coefficients?: number[];
  /** Multi-spectrum input: caller-supplied X values in keV. */
  energies?: number[];
  /** Multi-spectrum input: caller-supplied series (same length as energies). */
  series?: {
    data: number[];
    label?: string;
    color?: string;
    area?: boolean;
    /** Live time in seconds, used to compute CPS in the hover popup. */
    liveTime?: number;
  }[];
  height?: number;
  logScale?: boolean;
  /** Extra children rendered inside the LineChart (e.g. ChartsReferenceLine). */
  overlays?: ReactNode;
  /** Fired with the cursor's keV position, or null when the cursor leaves. */
  onPointerMove?: (kev: number | null) => void;
}

/** Minimum span (keV) to prevent degenerate zoom. */
const MIN_SPAN = 5;

/**
 * Chart margins — additional padding around the (auto-sized) axes.
 * Kept tight on the Y side so mobile viewports don't waste horizontal space.
 */
const CHART_MARGIN = { top: 10, right: 16, bottom: 4, left: 4 } as const;

/** Compact count-number formatter for Y-axis ticks (e.g. 12000 → "12k"). */
function formatCountCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${v}`;
}

/** Plot area (left offset and width) within the container, in CSS pixels. */
type PlotArea = { left: number; width: number };

/** Pan sensitivity: fraction of visible span per horizontal pixel. */
function pixelsToKev(dxPixels: number, span: number, area: PlotArea): number {
  if (area.width <= 0) return 0;
  return -(dxPixels / area.width) * span;
}

/** Convert a client X pixel inside the chart container to keV. */
function pixelToKev(
  pxWithinContainer: number,
  area: PlotArea,
  xRange: Range,
): number {
  if (area.width <= 0) return xRange[0];
  const pxWithinPlot = pxWithinContainer - area.left;
  const frac = Math.max(0, Math.min(1, pxWithinPlot / area.width));
  return xRange[0] + frac * (xRange[1] - xRange[0]);
}

/**
 * Helper rendered inside <LineChart> so it can consume MUI's chart context
 * hooks. Reports the actual drawing area (after MUI auto-sizes the axes) back
 * to the parent via the supplied callback — needed because MUI adds the
 * computed axis label width on top of the caller's `margin`, which the parent
 * cannot know just from its own DOM measurements.
 */
function DrawingAreaReporter({
  onArea,
}: {
  onArea: (a: PlotArea) => void;
}) {
  const { left, width } = useDrawingArea();
  useEffect(() => {
    onArea({ left, width });
  }, [left, width, onArea]);
  return null;
}

/**
 * Default X-range from either the (counts, coefficients) pair or explicit
 * energies: 0 up to the last channel above zero (+ small padding), mapped to
 * keV via the calibration polynomial.
 */
function computeDefaultXRange(
  counts: number[] | undefined,
  coefficients: number[] | undefined,
  energies: number[] | undefined,
): Range {
  if (energies && energies.length > 0) {
    return [energies[0], energies[energies.length - 1]];
  }
  if (counts && counts.length > 0 && coefficients && coefficients.length > 0) {
    let lastNonZero = 0;
    for (let i = counts.length - 1; i >= 0; i--) {
      if (counts[i] > 0) {
        lastNonZero = i;
        break;
      }
    }
    const lastCh = Math.min(lastNonZero + 20, counts.length - 1);
    return [
      channelToEnergy(0, coefficients),
      channelToEnergy(lastCh, coefficients),
    ];
  }
  return [0, 3000];
}

/**
 * Wrapper around MUI LineChart that adds wheel-zoom, drag-pan, pinch-zoom and
 * double-tap-reset. Pointer events are bound to the outer <Box> (not the SVG
 * directly) so MUI's internal chart layout stays intact.
 */
export default function ZoomableSpectrumChart({
  counts,
  coefficients,
  energies: energiesProp,
  series: seriesProp,
  height = 300,
  logScale = false,
  overlays,
  onPointerMove,
}: ZoomableSpectrumChartProps) {
  // Compute X-axis energies once per input change.
  const xEnergies = useMemo<number[] | null>(() => {
    if (energiesProp && energiesProp.length > 0) return energiesProp;
    if (counts && counts.length > 0 && coefficients) {
      return counts.map((_, ch) => channelToEnergy(ch, coefficients));
    }
    return null;
  }, [energiesProp, counts, coefficients]);

  // Compute series once per input change.
  const chartSeries = useMemo(() => {
    if (seriesProp && seriesProp.length > 0) return seriesProp;
    if (counts && counts.length > 0) {
      return [{ data: counts, showMark: false } as const];
    }
    return null;
  }, [seriesProp, counts]);

  const defaultXRange = useMemo<Range>(
    () => computeDefaultXRange(counts, coefficients, xEnergies ?? undefined),
    [counts, coefficients, xEnergies],
  );

  const [xRange, setXRange] = useState<Range>(defaultXRange);
  // Reset zoom when the underlying data shape changes drastically (new device
  // connection, different spectrum loaded, etc.). Detected via a cheap key.
  // Adjusting state during render is the sanctioned React pattern for
  // derived-state-resetting based on prop identity.
  const inputKey = `${xEnergies?.length ?? 0}:${defaultXRange[0]}:${defaultXRange[1]}`;
  const [lastInputKey, setLastInputKey] = useState<string>(inputKey);
  if (lastInputKey !== inputKey) {
    setLastInputKey(inputKey);
    setXRange(defaultXRange);
  }

  // Cursor-hover state for the nuclide tooltip / crosshair. `null` means the
  // pointer is outside or a drag/pinch gesture is active.
  const [hover, setHover] = useState<{
    kev: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Latest plot-area coordinates reported by DrawingAreaReporter. Updated on
  // every chart layout pass; read synchronously inside pointer handlers.
  const plotAreaRef = useRef<PlotArea>({
    left: CHART_MARGIN.left,
    width: 0,
  });
  const handlePlotArea = useCallback((a: PlotArea) => {
    plotAreaRef.current = a;
  }, []);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startRange: Range;
    moved: boolean;
  } | null>(null);
  // Active touch pointers (pointerId -> current client position).
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  // Pinch gesture tracking (two active touches). Zooms via distance change and
  // pans via midpoint translation so the pivot keV stays under the fingers.
  const pinchRef = useRef<{
    pointerIds: [number, number];
    startDistance: number;
    startRange: Range;
    pivotKev: number;
  } | null>(null);

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const pivot = pixelToKev(
        e.clientX - rect.left,
        plotAreaRef.current,
        xRange,
      );
      // deltaY < 0 = wheel up = zoom in
      const next = applyWheelZoom(xRange, pivot, e.deltaY, 1.2);
      if (next[1] - next[0] >= MIN_SPAN) {
        setXRange(next);
      }
    },
    [xRange],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (e.pointerType === 'touch') {
        // Track this touch.
        activeTouchesRef.current.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
        });
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }

        if (activeTouchesRef.current.size === 1) {
          // Single-finger touch acts as a "probe": show the nuclide popup at
          // the touch location (equivalent to desktop mouse hover). No pan.
          const kev = pixelToKev(
            e.clientX - rect.left,
            plotAreaRef.current,
            xRange,
          );
          setHover({ kev, clientX: e.clientX, clientY: e.clientY });
          if (onPointerMove) onPointerMove(kev);
          return;
        }

        if (activeTouchesRef.current.size === 2) {
          // Second finger down → start pinch (zoom + pan).
          const ids = Array.from(activeTouchesRef.current.keys()) as [
            number,
            number,
          ];
          const pa = activeTouchesRef.current.get(ids[0])!;
          const pb = activeTouchesRef.current.get(ids[1])!;
          const midPx = (pa.x + pb.x) / 2 - rect.left;
          pinchRef.current = {
            pointerIds: ids,
            startDistance: Math.abs(pa.x - pb.x),
            startRange: xRange,
            pivotKev: pixelToKev(midPx, plotAreaRef.current, xRange),
          };
          setHover(null);
          if (onPointerMove) onPointerMove(null);
        }
        return;
      }

      // Mouse/pen: drag pans, unchanged behaviour.
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startRange: xRange,
        moved: false,
      };
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [onPointerMove, xRange],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (e.pointerType === 'touch') {
        const active = activeTouchesRef.current;
        if (!active.has(e.pointerId)) return;
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Two-finger pinch: zoom by distance ratio, pan via midpoint.
        const pinch = pinchRef.current;
        if (pinch && active.size >= 2) {
          const [a, b] = pinch.pointerIds;
          const pa = active.get(a);
          const pb = active.get(b);
          if (pa && pb) {
            const dist = Math.abs(pa.x - pb.x);
            if (dist > 5 && pinch.startDistance > 5) {
              const ratio = pinch.startDistance / dist;
              const startSpan = pinch.startRange[1] - pinch.startRange[0];
              const newSpan = Math.max(MIN_SPAN, startSpan * ratio);
              // Place pivotKev under the current midpoint — this folds zoom
              // and midpoint-pan into a single anchored transform.
              const currentMidPx = (pa.x + pb.x) / 2;
              const area = plotAreaRef.current;
              const midWithinPlot = currentMidPx - rect.left - area.left;
              const frac = area.width > 0 ? midWithinPlot / area.width : 0.5;
              const newA = pinch.pivotKev - newSpan * frac;
              setXRange([newA, newA + newSpan]);
            }
          }
          return;
        }

        // Single-finger probe: update hover popup.
        if (active.size === 1) {
          const kev = pixelToKev(
            e.clientX - rect.left,
            plotAreaRef.current,
            xRange,
          );
          setHover({ kev, clientX: e.clientX, clientY: e.clientY });
          if (onPointerMove) onPointerMove(kev);
        }
        return;
      }

      // Mouse/pen: drag pans.
      const pan = panRef.current;
      if (pan) {
        const dx = e.clientX - pan.startX;
        if (Math.abs(dx) > 2) pan.moved = true;
        const span = pan.startRange[1] - pan.startRange[0];
        const deltaKev = pixelsToKev(dx, span, plotAreaRef.current);
        setXRange(applyPan(pan.startRange, deltaKev));
        setHover(null);
        return;
      }

      // Hover: cursor over chart, no active gesture.
      const kev = pixelToKev(
        e.clientX - rect.left,
        plotAreaRef.current,
        xRange,
      );
      setHover({ kev, clientX: e.clientX, clientY: e.clientY });
      if (onPointerMove) onPointerMove(kev);
    },
    [onPointerMove, xRange],
  );

  const endGesture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        activeTouchesRef.current.delete(e.pointerId);

        if (pinchRef.current?.pointerIds.includes(e.pointerId)) {
          pinchRef.current = null;
          // If one finger remains, show its probe position.
          if (
            activeTouchesRef.current.size === 1 &&
            containerRef.current
          ) {
            const [remaining] = activeTouchesRef.current.values();
            const rect = containerRef.current.getBoundingClientRect();
            const kev = pixelToKev(
              remaining.x - rect.left,
              plotAreaRef.current,
              xRange,
            );
            setHover({ kev, clientX: remaining.x, clientY: remaining.y });
            if (onPointerMove) onPointerMove(kev);
          }
        }

        if (activeTouchesRef.current.size === 0) {
          setHover(null);
          if (onPointerMove) onPointerMove(null);
        }
        return;
      }

      if (panRef.current?.pointerId === e.pointerId) {
        panRef.current = null;
      }
    },
    [onPointerMove, xRange],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      endGesture(e);
    },
    [endGesture],
  );

  const handlePointerLeave = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      endGesture(e);
      if (e.pointerType !== 'touch') {
        setHover(null);
        onPointerMove?.(null);
      }
    },
    [endGesture, onPointerMove],
  );

  const handleDoubleClick = useCallback(() => {
    setXRange(resetRange(defaultXRange));
  }, [defaultXRange]);

  const hoverHits: NuclideAtEnergy[] = useMemo(
    () => (hover ? nuclidesAtEnergy(hover.kev) : []),
    [hover],
  );

  // Per-series counts/CPS at the cursor position. Uses the nearest x-axis
  // index to pick a bin from each series' `data` array.
  const hoverSeriesValues = useMemo<
    {
      label: string;
      color?: string;
      counts: number;
      cps: number | null;
    }[]
  >(() => {
    if (!hover || !chartSeries || !xEnergies || xEnergies.length === 0) {
      return [];
    }
    let idx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < xEnergies.length; i++) {
      const diff = Math.abs(xEnergies[i] - hover.kev);
      if (diff < bestDiff) {
        bestDiff = diff;
        idx = i;
      }
    }
    return chartSeries.map((s, i) => {
      const anyS = s as {
        data: number[];
        label?: string;
        color?: string;
        liveTime?: number;
      };
      const counts = anyS.data[idx] ?? 0;
      const live = typeof anyS.liveTime === 'number' ? anyS.liveTime : null;
      return {
        label: anyS.label ?? `Serie ${i + 1}`,
        color: anyS.color,
        counts,
        cps: live && live > 0 ? counts / live : null,
      };
    });
  }, [hover, chartSeries, xEnergies]);

  // Virtual anchor element for the Popper so it tracks the cursor precisely.
  // Popper needs getBoundingClientRect; we build a minimal stub from the
  // hover state. When `hover` is null the anchor is null and the Popper stays
  // closed.
  const popperAnchor = useMemo<{
    getBoundingClientRect: () => DOMRect;
  } | null>(() => {
    if (!hover) return null;
    const { clientX, clientY } = hover;
    return {
      getBoundingClientRect: () =>
        ({
          x: clientX,
          y: clientY,
          left: clientX,
          top: clientY,
          right: clientX,
          bottom: clientY,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    };
  }, [hover]);

  if (!chartSeries || !xEnergies) {
    return null;
  }

  const roundedEnergies = xEnergies.map((e) => Math.round(e * 10) / 10);

  // Best match (first after sorting by distance/intensity) provides the
  // reference-line overlay for the remaining peaks of that nuclide.
  const bestMatch = hoverHits[0];
  const bestPeakLines =
    bestMatch?.nuclide.peaks?.filter(
      (p) => p.energy >= xRange[0] && p.energy <= xRange[1],
    ) ?? [];

  return (
    <Box
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
      sx={{
        width: '100%',
        position: 'relative',
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'crosshair',
      }}
    >
      <LineChart
        height={height}
        xAxis={[
          {
            id: 'energy',
            data: roundedEnergies,
            label: 'Energie (keV)',
            scaleType: 'linear',
            min: xRange[0],
            max: xRange[1],
            valueFormatter: (v: number) => `${v} keV`,
          },
        ]}
        yAxis={[
          {
            scaleType: logScale ? 'log' : 'linear',
            valueFormatter: formatCountCompact,
          },
        ]}
        series={chartSeries.map((s) => {
          // MUI LineChart doesn't know about our custom `liveTime` prop — strip it.
          const { liveTime: _liveTime, ...rest } = s as typeof s & {
            liveTime?: number;
          };
          void _liveTime;
          // Log scale can't plot zeros — clamp to 0.5 so empty bins render
          // just below the first visible tick instead of dropping the series.
          const data = logScale
            ? rest.data.map((c) => (c > 0 ? c : 0.5))
            : rest.data;
          return {
            ...rest,
            data,
            showMark: false,
            curve: 'linear' as const,
          };
        })}
        margin={CHART_MARGIN}
        axisHighlight={{ x: 'none', y: 'none' }}
        slotProps={{ tooltip: { trigger: 'none' } }}
      >
        <DrawingAreaReporter onArea={handlePlotArea} />
        {overlays}
        {hover && (
          <ChartsReferenceLine
            x={hover.kev}
            lineStyle={{
              stroke: '#455a64',
              strokeWidth: 1,
              strokeDasharray: '3 3',
            }}
          />
        )}
        {bestMatch &&
          bestPeakLines.map((p) => (
            <ChartsReferenceLine
              key={`${bestMatch.nuclide.name}:${p.energy}`}
              x={p.energy}
              label={`${bestMatch.nuclide.name} ${Math.round(p.energy)}`}
              labelAlign="start"
              lineStyle={{
                stroke: '#00796b',
                strokeWidth: 1.5,
                strokeDasharray: '4 2',
              }}
              labelStyle={{
                fontSize: 10,
                fill: '#00796b',
                fontWeight: 'bold',
              }}
            />
          ))}
      </LineChart>
      <Popper
        open={Boolean(hover && popperAnchor)}
        anchorEl={popperAnchor}
        placement="top-start"
        modifiers={[{ name: 'offset', options: { offset: [12, 12] } }]}
        style={{ pointerEvents: 'none', zIndex: 10 }}
      >
        {hover && (
          <Paper
            elevation={3}
            sx={{ px: 1.25, py: 0.75, maxWidth: 260, fontSize: 12 }}
          >
            <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
              {hover.kev.toFixed(1)} keV
            </Typography>
            {hoverHits.length === 0 ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block' }}
              >
                Kein bekanntes Nuklid in der Naehe
              </Typography>
            ) : (
              hoverHits.slice(0, 3).map((h) => (
                <Typography
                  key={h.nuclide.name}
                  variant="caption"
                  sx={{ display: 'block' }}
                >
                  <strong>{h.nuclide.name}</strong> —{' '}
                  {h.closestPeakKev.toFixed(1)} keV ({h.distanceKev.toFixed(1)}{' '}
                  keV, I={(h.intensity * 100).toFixed(1)}%)
                </Typography>
              ))
            )}
            {hoverSeriesValues.length > 0 && (
              <Box
                sx={{
                  mt: 0.5,
                  pt: 0.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {hoverSeriesValues.map((v) => (
                  <Typography
                    key={v.label}
                    variant="caption"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    {v.color && (
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: v.color,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span>
                      <strong>{v.label}:</strong>{' '}
                      {v.cps !== null
                        ? `${v.cps.toFixed(2)} cps`
                        : `${v.counts} counts`}
                    </span>
                  </Typography>
                ))}
              </Box>
            )}
          </Paper>
        )}
      </Popper>
    </Box>
  );
}
