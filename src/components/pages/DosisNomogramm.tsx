'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import {
  BOTTOM,
  inRangeD,
  inRangeM,
  inRangeR1,
  inRangeTime,
  mFromDoseAndR1,
  mFromTeTs,
  TOP,
  VB_H,
  VB_W,
  X_D,
  X_PIVOT,
  X_R1,
  X_TE,
  X_TS,
  yD,
  yPivot,
  yR1,
  yTe,
  yTs,
} from './dosisNomogrammGeometry';

export interface DosisNomogrammProps {
  /** Bezugsdosisleistung R₁ (mSv/h). */
  r1: number | null;
  r1IsComputed: boolean;
  /** Eintrittszeit Te (h nach Detonation). */
  te: number | null;
  teIsComputed: boolean;
  /** Aufenthaltsdauer Ts (h). */
  ts: number | null;
  tsIsComputed: boolean;
  /** Gesamtdosis D (mSv). */
  d: number | null;
  dIsComputed: boolean;
}

const D_TICKS = [0.01, 0.1, 1, 10, 100, 1000, 10000];
const R1_TICKS = [0.01, 0.1, 1, 10, 100, 1000, 10000];
const M_TICKS = [0.001, 0.01, 0.1, 1, 10];
const T_TICKS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 100, 1000];

function fmtNum(v: number): string {
  if (v >= 1000) return `${v / 1000}k`;
  if (v >= 1) return v.toString();
  return v.toString();
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
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={fill}
      stroke={stroke}
      strokeWidth="1.5"
    />
  );
}

export default function DosisNomogramm({
  r1,
  r1IsComputed,
  te,
  teIsComputed,
  ts,
  tsIsComputed,
  d,
  dIsComputed,
}: DosisNomogrammProps) {
  const t = useTranslations('schadstoff.dosisNomogramm');
  const theme = useTheme();
  const fg = theme.palette.text.primary;
  const fgSub = theme.palette.text.secondary;
  const grid = theme.palette.divider;
  const inputCol = theme.palette.primary.main;
  const computedCol = theme.palette.warning.main;
  const stepCol1 = theme.palette.primary.main;
  const stepCol2 = theme.palette.secondary.main;
  const pointStroke = theme.palette.background.paper;

  function colorFor(isComputed: boolean): string {
    return isComputed ? computedCol : inputCol;
  }

  // Compute M from each path (if data sufficient)
  const mFromTime =
    inRangeTime(te) && inRangeTime(ts) ? mFromTeTs(te, ts) : null;
  const mFromDose =
    inRangeD(d) && inRangeR1(r1) ? mFromDoseAndR1(d, r1) : null;

  // Step 1 construction line: Te ↔ Pivot ↔ Ts (when both Te and Ts known)
  const showStep1 =
    inRangeTime(te) && inRangeTime(ts) && mFromTime !== null && inRangeM(mFromTime);

  // Step 2 construction line: Pivot ↔ R₁ ↔ D
  const mForStep2 = mFromDose ?? mFromTime;
  const showStep2 =
    inRangeD(d) &&
    inRangeR1(r1) &&
    mForStep2 !== null &&
    inRangeM(mForStep2);

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
          maxWidth: VB_W,
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
          {/* Titles */}
          {[
            { x: X_D, label: t('axisD'), sub: t('axisDSub') },
            { x: X_R1, label: t('axisR1'), sub: t('axisR1Sub') },
            { x: X_PIVOT, label: t('axisPivot'), sub: t('axisPivotSub') },
            { x: X_TS, label: t('axisTs'), sub: t('axisTsSub') },
            { x: X_TE, label: t('axisTe'), sub: t('axisTeSub') },
          ].map(({ x, label, sub }) => (
            <g key={`title-${x}`}>
              <text
                x={x}
                y={TOP - 40}
                textAnchor="middle"
                fill={fg}
                fontSize="13"
                fontWeight="bold"
              >
                {label}
              </text>
              <text
                x={x}
                y={TOP - 24}
                textAnchor="middle"
                fill={fgSub}
                fontSize="10"
              >
                {sub}
              </text>
            </g>
          ))}

          {/* Vertical axes */}
          {[X_D, X_R1, X_PIVOT, X_TS, X_TE].map((x) => (
            <line
              key={`axis-${x}`}
              x1={x}
              y1={TOP}
              x2={x}
              y2={BOTTOM}
              stroke={fg}
              strokeWidth="1.5"
            />
          ))}

          {/* D ticks */}
          {D_TICKS.map((v) => {
            const y = yD(v);
            return (
              <g key={`d-${v}`}>
                <line
                  x1={X_D - 5}
                  y1={y}
                  x2={X_D + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_D - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtNum(v)}
                </text>
              </g>
            );
          })}

          {/* R₁ ticks */}
          {R1_TICKS.map((v) => {
            const y = yR1(v);
            return (
              <g key={`r1-${v}`}>
                <line
                  x1={X_R1 - 5}
                  y1={y}
                  x2={X_R1 + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_R1 - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtNum(v)}
                </text>
              </g>
            );
          })}

          {/* Pivot ticks */}
          {M_TICKS.map((v) => {
            const y = yPivot(v);
            return (
              <g key={`m-${v}`}>
                <line
                  x1={X_PIVOT - 5}
                  y1={y}
                  x2={X_PIVOT + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_PIVOT - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtNum(v)}
                </text>
              </g>
            );
          })}

          {/* Ts ticks */}
          {T_TICKS.map((v) => {
            const y = yTs(v);
            return (
              <g key={`ts-${v}`}>
                <line
                  x1={X_TS - 5}
                  y1={y}
                  x2={X_TS + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_TS + 8}
                  y={y + 4}
                  textAnchor="start"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtNum(v)}
                </text>
              </g>
            );
          })}

          {/* Te ticks */}
          {T_TICKS.map((v) => {
            const y = yTe(v);
            return (
              <g key={`te-${v}`}>
                <line
                  x1={X_TE - 5}
                  y1={y}
                  x2={X_TE + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_TE + 8}
                  y={y + 4}
                  textAnchor="start"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtNum(v)}
                </text>
              </g>
            );
          })}

          {/* === Construction lines === */}
          {/* Step 1: Te → Pivot → Ts (V-Shape through pivot at M_time) */}
          {showStep1 && (
            <>
              <line
                x1={X_TE}
                y1={yTe(te)}
                x2={X_PIVOT}
                y2={yPivot(mFromTime)}
                stroke={stepCol1}
                strokeWidth="2"
              />
              <line
                x1={X_PIVOT}
                y1={yPivot(mFromTime)}
                x2={X_TS}
                y2={yTs(ts)}
                stroke={stepCol1}
                strokeWidth="2"
              />
            </>
          )}

          {/* Step 2: Pivot → R₁ → D */}
          {showStep2 && (
            <>
              <line
                x1={X_PIVOT}
                y1={yPivot(mForStep2)}
                x2={X_R1}
                y2={yR1(r1)}
                stroke={stepCol2}
                strokeWidth="2"
                strokeDasharray="6,3"
              />
              <line
                x1={X_R1}
                y1={yR1(r1)}
                x2={X_D}
                y2={yD(d)}
                stroke={stepCol2}
                strokeWidth="2"
                strokeDasharray="6,3"
              />
            </>
          )}

          {/* === Points (with labels) === */}
          {inRangeD(d) && (
            <>
              <ScalePoint
                cx={X_D}
                cy={yD(d)}
                fill={colorFor(dIsComputed)}
                stroke={pointStroke}
                isComputed={dIsComputed}
              />
              <text
                x={X_D - 18}
                y={yD(d) - 8}
                textAnchor="end"
                fill={colorFor(dIsComputed)}
                fontSize="11"
                fontWeight="bold"
              >
                D = {fmtVal(d, 2)}
              </text>
            </>
          )}

          {inRangeR1(r1) && (
            <>
              <ScalePoint
                cx={X_R1}
                cy={yR1(r1)}
                fill={colorFor(r1IsComputed)}
                stroke={pointStroke}
                isComputed={r1IsComputed}
              />
              <text
                x={X_R1 - 18}
                y={yR1(r1) - 8}
                textAnchor="end"
                fill={colorFor(r1IsComputed)}
                fontSize="11"
                fontWeight="bold"
              >
                R₁ = {fmtVal(r1, 2)}
              </text>
            </>
          )}

          {/* Pivot point — drawn if M from either path is in range */}
          {mForStep2 !== null && inRangeM(mForStep2) && (
            <>
              <ScalePoint
                cx={X_PIVOT}
                cy={yPivot(mForStep2)}
                fill={computedCol}
                stroke={pointStroke}
                isComputed={true}
              />
              <text
                x={X_PIVOT + 14}
                y={yPivot(mForStep2) - 8}
                textAnchor="start"
                fill={computedCol}
                fontSize="11"
                fontWeight="bold"
              >
                M = {fmtVal(mForStep2, 3)}
              </text>
            </>
          )}

          {inRangeTime(ts) && (
            <>
              <ScalePoint
                cx={X_TS}
                cy={yTs(ts)}
                fill={colorFor(tsIsComputed)}
                stroke={pointStroke}
                isComputed={tsIsComputed}
              />
              <text
                x={X_TS + 18}
                y={yTs(ts) - 8}
                textAnchor="start"
                fill={colorFor(tsIsComputed)}
                fontSize="11"
                fontWeight="bold"
              >
                Ts = {fmtVal(ts, 2)} h
              </text>
            </>
          )}

          {inRangeTime(te) && (
            <>
              <ScalePoint
                cx={X_TE}
                cy={yTe(te)}
                fill={colorFor(teIsComputed)}
                stroke={pointStroke}
                isComputed={teIsComputed}
              />
              <text
                x={X_TE + 18}
                y={yTe(te) - 8}
                textAnchor="start"
                fill={colorFor(teIsComputed)}
                fontSize="11"
                fontWeight="bold"
              >
                Te = {fmtVal(te, 2)} h
              </text>
            </>
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
              stroke={stepCol1}
              strokeWidth="2"
            />
            <text x={230} y={10} fill={fg} fontSize="11">
              {t('legendStep1')}
            </text>
            <line
              x1={330}
              y1={6}
              x2={354}
              y2={6}
              stroke={stepCol2}
              strokeWidth="2"
              strokeDasharray="6,3"
            />
            <text x={360} y={10} fill={fg} fontSize="11">
              {t('legendStep2')}
            </text>
          </g>
        </svg>
      </Box>
    </Box>
  );
}
