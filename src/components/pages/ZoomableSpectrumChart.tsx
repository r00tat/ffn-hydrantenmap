'use client';

import Box from '@mui/material/Box';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
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

/** Pan sensitivity: fraction of visible span per horizontal pixel. */
function pixelsToKev(dxPixels: number, span: number, widthPx: number): number {
  if (widthPx <= 0) return 0;
  return -(dxPixels / widthPx) * span;
}

/** Convert a client X pixel inside the chart container to keV. */
function pixelToKev(
  pxWithinContainer: number,
  containerWidth: number,
  xRange: Range,
): number {
  if (containerWidth <= 0) return xRange[0];
  const frac = Math.max(0, Math.min(1, pxWithinContainer / containerWidth));
  return xRange[0] + frac * (xRange[1] - xRange[0]);
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startRange: Range;
    moved: boolean;
  } | null>(null);
  // Pinch gesture tracking (two active touches).
  const pinchRef = useRef<{
    pointerIds: [number, number];
    positions: Map<number, number>; // pointerId -> clientX
    startDistance: number;
    startRange: Range;
    pivotKev: number;
  } | null>(null);

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const pivot = pixelToKev(e.clientX - rect.left, rect.width, xRange);
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
      // Collect multi-pointer state for pinch handling.
      if (panRef.current) {
        // Transition pan → pinch when a second pointer touches down.
        const first = panRef.current;
        if (e.pointerId !== first.pointerId && containerRef.current) {
          // Get the existing pointer's last known position (approx: use startX).
          const positions = new Map<number, number>();
          positions.set(first.pointerId, first.startX);
          positions.set(e.pointerId, e.clientX);
          const rect = containerRef.current.getBoundingClientRect();
          const midPx =
            (first.startX + e.clientX) / 2 - rect.left;
          pinchRef.current = {
            pointerIds: [first.pointerId, e.pointerId],
            positions,
            startDistance: Math.abs(first.startX - e.clientX),
            startRange: xRange,
            pivotKev: pixelToKev(midPx, rect.width, xRange),
          };
          panRef.current = null;
          return;
        }
      }
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
    [xRange],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      // Pinch update
      const pinch = pinchRef.current;
      if (pinch && pinch.positions.has(e.pointerId)) {
        pinch.positions.set(e.pointerId, e.clientX);
        const [a, b] = pinch.pointerIds;
        const xa = pinch.positions.get(a);
        const xb = pinch.positions.get(b);
        if (xa !== undefined && xb !== undefined) {
          const dist = Math.abs(xa - xb);
          if (dist > 5 && pinch.startDistance > 5) {
            const ratio = pinch.startDistance / dist; // pinch-out (dist bigger) → ratio<1 → zoom in
            const startSpan = pinch.startRange[1] - pinch.startRange[0];
            const newSpan = Math.max(MIN_SPAN, startSpan * ratio);
            const leftFrac =
              (pinch.pivotKev - pinch.startRange[0]) / startSpan;
            const newA = pinch.pivotKev - newSpan * leftFrac;
            setXRange([newA, newA + newSpan]);
          }
        }
        return;
      }

      // Pan update
      const pan = panRef.current;
      if (pan) {
        const dx = e.clientX - pan.startX;
        if (Math.abs(dx) > 2) pan.moved = true;
        const span = pan.startRange[1] - pan.startRange[0];
        const deltaKev = pixelsToKev(dx, span, rect.width);
        setXRange(applyPan(pan.startRange, deltaKev));
        return;
      }

      // Hover notification only when no gesture is active.
      if (onPointerMove) {
        onPointerMove(pixelToKev(e.clientX - rect.left, rect.width, xRange));
      }
    },
    [onPointerMove, xRange],
  );

  const endGesture = useCallback(
    (pointerId: number) => {
      if (pinchRef.current?.pointerIds.includes(pointerId)) {
        // When one pointer lifts during pinch, remaining pointer takes over pan.
        const other = pinchRef.current.pointerIds.find(
          (id) => id !== pointerId,
        );
        const remainingX =
          other !== undefined
            ? pinchRef.current.positions.get(other)
            : undefined;
        pinchRef.current = null;
        if (other !== undefined && remainingX !== undefined) {
          panRef.current = {
            pointerId: other,
            startX: remainingX,
            startRange: xRange,
            moved: true,
          };
        }
        return;
      }
      if (panRef.current?.pointerId === pointerId) {
        panRef.current = null;
      }
    },
    [xRange],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      endGesture(e.pointerId);
    },
    [endGesture],
  );

  const handlePointerLeave = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      endGesture(e.pointerId);
      onPointerMove?.(null);
    },
    [endGesture, onPointerMove],
  );

  const handleDoubleClick = useCallback(() => {
    setXRange(resetRange(defaultXRange));
  }, [defaultXRange]);

  if (!chartSeries || !xEnergies) {
    return null;
  }

  const roundedEnergies = xEnergies.map((e) => Math.round(e * 10) / 10);

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
            label: 'Counts',
            scaleType: logScale ? 'log' : 'linear',
          },
        ]}
        series={chartSeries.map((s) => ({
          ...s,
          showMark: false,
          curve: 'linear' as const,
        }))}
        margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
      >
        {overlays}
      </LineChart>
    </Box>
  );
}
