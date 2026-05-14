'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import {
  BOTTOM,
  CHART_CENTER_Y,
  inRangeR,
  inRangeT,
  TOP,
  VB_H,
  VB_W,
  X_LEFT,
  X_MID,
  X_RIGHT,
  yLeftR,
  yMidT,
  yRightR1,
} from './dosisleistungsNomogrammGeometry';

export interface DosisleistungsNomogrammProps {
  /** Bezugsdosisleistung R₁ bei H+1 (mSv/h). */
  r1: number | null;
  r1IsComputed: boolean;
  /** Messung Section 1: Dosisleistung R(t) zur Messzeit. */
  rtMeas: number | null;
  rtMeasIsComputed: boolean;
  /** Messzeit t nach Detonation (h). */
  tMeas: number | null;
  tMeasIsComputed: boolean;
  /** Section 2: Dosisleistung zu einer anderen Zeit. */
  rtPrime: number | null;
  rtPrimeIsComputed: boolean;
  /** Andere Zeit t' (h). */
  tPrime: number | null;
  tPrimeIsComputed: boolean;
}

const R_TICKS = [0.01, 0.1, 1, 10, 100, 1000, 10000];
const T_TICKS = [
  0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000,
];

function fmtR(r: number): string {
  if (r >= 1000) return `${r / 1000}k`;
  if (r >= 1) return String(r);
  return String(r);
}

function fmtT(t: number): string {
  if (t >= 1) return String(t);
  return String(t);
}

function fmtVal(v: number, digits: number): string {
  return v.toFixed(digits).replace(/\.?0+$/, '');
}

interface PointProps {
  cx: number;
  cy: number;
  fill: string;
  stroke: string;
  isComputed: boolean;
}

function ScalePoint({ cx, cy, fill, stroke, isComputed }: PointProps) {
  if (isComputed) {
    // Diamond shape for computed values
    const s = 6;
    return (
      <polygon
        points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
    );
  }
  return (
    <circle cx={cx} cy={cy} r={5} fill={fill} stroke={stroke} strokeWidth="1.5" />
  );
}

export default function DosisleistungsNomogramm({
  r1,
  r1IsComputed,
  rtMeas,
  rtMeasIsComputed,
  tMeas,
  tMeasIsComputed,
  rtPrime,
  rtPrimeIsComputed,
  tPrime,
  tPrimeIsComputed,
}: DosisleistungsNomogrammProps) {
  const t = useTranslations('schadstoff.dosisleistungsNomogramm');
  const theme = useTheme();
  const fg = theme.palette.text.primary;
  const fgSub = theme.palette.text.secondary;
  const grid = theme.palette.divider;
  const inputCol = theme.palette.primary.main;
  const computedCol = theme.palette.warning.main;
  const lineCol = theme.palette.primary.main;
  const linePrimeCol = theme.palette.secondary.main;
  const pointStroke = theme.palette.background.paper;

  // === Lines (Section 1 + Section 2) ===
  const showMeasLine =
    inRangeR(rtMeas) && inRangeT(tMeas) && inRangeR(r1);
  const showPrimeLine =
    inRangeR(rtPrime) && inRangeT(tPrime) && inRangeR(r1);

  function colorFor(isComputed: boolean): string {
    return isComputed ? computedCol : inputCol;
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('description')}
      </Typography>

      <Box
        sx={{
          width: '100%',
          maxWidth: 720,
          overflowX: 'auto',
          border: 1,
          borderColor: grid,
          borderRadius: 1,
          bgcolor: 'background.paper',
        }}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {/* Title labels */}
          <text
            x={X_LEFT}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="14"
            fontWeight="bold"
          >
            {t('axisR')}
          </text>
          <text
            x={X_LEFT}
            y={TOP - 22}
            textAnchor="middle"
            fill={fgSub}
            fontSize="11"
          >
            {t('axisRSub')}
          </text>
          <text
            x={X_MID}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="14"
            fontWeight="bold"
          >
            {t('axisT')}
          </text>
          <text
            x={X_MID}
            y={TOP - 22}
            textAnchor="middle"
            fill={fgSub}
            fontSize="11"
          >
            {t('axisTSub')}
          </text>
          <text
            x={X_RIGHT}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="14"
            fontWeight="bold"
          >
            {t('axisR1')}
          </text>
          <text
            x={X_RIGHT}
            y={TOP - 22}
            textAnchor="middle"
            fill={fgSub}
            fontSize="11"
          >
            {t('axisR1Sub')}
          </text>

          {/* Vertical axes */}
          <line
            x1={X_LEFT}
            y1={TOP}
            x2={X_LEFT}
            y2={BOTTOM}
            stroke={fg}
            strokeWidth="1.5"
          />
          <line
            x1={X_MID}
            y1={TOP}
            x2={X_MID}
            y2={BOTTOM}
            stroke={fg}
            strokeWidth="1.5"
          />
          <line
            x1={X_RIGHT}
            y1={TOP}
            x2={X_RIGHT}
            y2={BOTTOM}
            stroke={fg}
            strokeWidth="1.5"
          />

          {/* Center marker on t scale (t=1) */}
          <line
            x1={X_MID - 12}
            y1={CHART_CENTER_Y}
            x2={X_MID + 12}
            y2={CHART_CENTER_Y}
            stroke={grid}
            strokeWidth="1"
            strokeDasharray="2,2"
          />

          {/* Left scale ticks: R(t) — high R at top */}
          {R_TICKS.map((r) => {
            const y = yLeftR(r);
            return (
              <g key={`l-${r}`}>
                <line
                  x1={X_LEFT - 6}
                  y1={y}
                  x2={X_LEFT + 6}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_LEFT - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill={fg}
                  fontSize="11"
                >
                  {fmtR(r)}
                </text>
              </g>
            );
          })}

          {/* Right scale ticks: R₁ — inverted (small at top) */}
          {R_TICKS.map((r) => {
            const y = yRightR1(r);
            return (
              <g key={`r-${r}`}>
                <line
                  x1={X_RIGHT - 6}
                  y1={y}
                  x2={X_RIGHT + 6}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_RIGHT + 10}
                  y={y + 4}
                  textAnchor="start"
                  fill={fg}
                  fontSize="11"
                >
                  {fmtR(r)}
                </text>
              </g>
            );
          })}

          {/* Middle scale ticks: t */}
          {T_TICKS.map((tv) => {
            const y = yMidT(tv);
            if (y < TOP - 2 || y > BOTTOM + 2) return null;
            return (
              <g key={`m-${tv}`}>
                <line
                  x1={X_MID - 5}
                  y1={y}
                  x2={X_MID + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_MID + 10}
                  y={y + 4}
                  textAnchor="start"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtT(tv)}
                </text>
              </g>
            );
          })}

          {/* Measurement line (Section 1) */}
          {showMeasLine && (
            <line
              x1={X_LEFT}
              y1={yLeftR(rtMeas)}
              x2={X_RIGHT}
              y2={yRightR1(r1)}
              stroke={lineCol}
              strokeWidth="2"
              strokeDasharray="0"
            />
          )}

          {/* Section 2 line — same R₁ point, different R(t')/t' */}
          {showPrimeLine && (
            <line
              x1={X_LEFT}
              y1={yLeftR(rtPrime)}
              x2={X_RIGHT}
              y2={yRightR1(r1)}
              stroke={linePrimeCol}
              strokeWidth="2"
              strokeDasharray="6,3"
            />
          )}

          {/* === Points === */}
          {/* R₁ on right scale */}
          {inRangeR(r1) && (
            <>
              <ScalePoint
                cx={X_RIGHT}
                cy={yRightR1(r1)}
                fill={colorFor(r1IsComputed)}
                stroke={pointStroke}
                isComputed={r1IsComputed}
              />
              <text
                x={X_RIGHT + 28}
                y={yRightR1(r1) - 8}
                fill={colorFor(r1IsComputed)}
                fontSize="11"
                fontWeight="bold"
              >
                R₁ = {fmtVal(r1, 2)}
              </text>
            </>
          )}

          {/* Section 1 measurement points */}
          {inRangeR(rtMeas) && (
            <>
              <ScalePoint
                cx={X_LEFT}
                cy={yLeftR(rtMeas)}
                fill={colorFor(rtMeasIsComputed)}
                stroke={pointStroke}
                isComputed={rtMeasIsComputed}
              />
              <text
                x={X_LEFT - 12}
                y={yLeftR(rtMeas) - 8}
                textAnchor="end"
                fill={colorFor(rtMeasIsComputed)}
                fontSize="11"
                fontWeight="bold"
              >
                R(t) = {fmtVal(rtMeas, 2)}
              </text>
            </>
          )}
          {inRangeT(tMeas) && (
            <ScalePoint
              cx={X_MID}
              cy={yMidT(tMeas)}
              fill={colorFor(tMeasIsComputed)}
              stroke={pointStroke}
              isComputed={tMeasIsComputed}
            />
          )}
          {inRangeT(tMeas) && (
            <text
              x={X_MID - 10}
              y={yMidT(tMeas) - 6}
              textAnchor="end"
              fill={colorFor(tMeasIsComputed)}
              fontSize="11"
              fontWeight="bold"
            >
              t = {fmtVal(tMeas, 2)} h
            </text>
          )}

          {/* Section 2 (prime) points */}
          {inRangeR(rtPrime) && (
            <>
              <ScalePoint
                cx={X_LEFT}
                cy={yLeftR(rtPrime)}
                fill={colorFor(rtPrimeIsComputed)}
                stroke={pointStroke}
                isComputed={rtPrimeIsComputed}
              />
              <text
                x={X_LEFT - 12}
                y={yLeftR(rtPrime) + 14}
                textAnchor="end"
                fill={colorFor(rtPrimeIsComputed)}
                fontSize="11"
                fontWeight="bold"
              >
                R(t&apos;) = {fmtVal(rtPrime, 2)}
              </text>
            </>
          )}
          {inRangeT(tPrime) && (
            <ScalePoint
              cx={X_MID}
              cy={yMidT(tPrime)}
              fill={colorFor(tPrimeIsComputed)}
              stroke={pointStroke}
              isComputed={tPrimeIsComputed}
            />
          )}
          {inRangeT(tPrime) && (
            <text
              x={X_MID - 10}
              y={yMidT(tPrime) + 14}
              textAnchor="end"
              fill={colorFor(tPrimeIsComputed)}
              fontSize="11"
              fontWeight="bold"
            >
              t&apos; = {fmtVal(tPrime, 2)} h
            </text>
          )}

          {/* Legend */}
          <g transform={`translate(20, ${VB_H - 40})`}>
            <circle cx={8} cy={6} r={5} fill={inputCol} stroke={pointStroke} />
            <text x={20} y={10} fill={fg} fontSize="11">
              {t('legendInput')}
            </text>
            <polygon
              points="92,1 98,6 92,11 86,6"
              fill={computedCol}
              stroke={pointStroke}
              strokeWidth="1.5"
            />
            <text x={104} y={10} fill={fg} fontSize="11">
              {t('legendComputed')}
            </text>
            <line
              x1={200}
              y1={6}
              x2={224}
              y2={6}
              stroke={lineCol}
              strokeWidth="2"
            />
            <text x={230} y={10} fill={fg} fontSize="11">
              {t('legendMeasLine')}
            </text>
            <line
              x1={330}
              y1={6}
              x2={354}
              y2={6}
              stroke={linePrimeCol}
              strokeWidth="2"
              strokeDasharray="6,3"
            />
            <text x={360} y={10} fill={fg} fontSize="11">
              {t('legendPrimeLine')}
            </text>
          </g>
        </svg>
      </Box>
    </Box>
  );
}
