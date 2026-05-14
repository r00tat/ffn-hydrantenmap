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
  inRangeTe,
  inRangeTs,
  mFromDoseAndR1,
  mFromTeTs,
  TOP,
  VB_H,
  VB_W,
  X_D,
  X_M,
  X_R1,
  X_TE_BOTTOM,
  X_TE_TOP,
  xTe,
  xTs,
  Y_TE_BOTTOM,
  Y_TE_TOP,
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

const D_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const R1_TICKS = [1, 10, 100, 1000, 10000, 100000, 1000000];
const M_TICKS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];
const TE_TICKS = [0.5, 1, 2, 5, 10, 24, 48, 120, 240, 720];
const TS_TICKS = [0.1, 0.2, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24];

function fmtTick(v: number): string {
  if (v >= 1_000_000) return `${v / 1_000_000}M`;
  if (v >= 1000) return `${v / 1000}k`;
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
  // Schritt 1: blau (Te → Ts → Bezugslinie)
  const stepCol1 = '#2962ff';
  // Schritt 2: rot (Bezugslinie → R₁ → D)
  const stepCol2 = '#d32f2f';
  const pointStroke = theme.palette.background.paper;

  function colorFor(isComputed: boolean): string {
    return isComputed ? computedCol : inputCol;
  }

  const mFromTime =
    inRangeTe(te) && inRangeTs(ts) ? mFromTeTs(te, ts) : null;
  const mFromDose =
    inRangeD(d) && inRangeR1(r1) ? mFromDoseAndR1(d, r1) : null;

  // Schritt 1: gerade Linie von Te über Ts zur Bezugslinie
  const showStep1 =
    inRangeTe(te) &&
    inRangeTs(ts) &&
    mFromTime !== null &&
    inRangeM(mFromTime);

  // Schritt 2: gerade Linie von Bezugslinie über R₁ zur Dosis
  const mForStep2 = mFromDose ?? mFromTime;
  const showStep2 =
    inRangeD(d) &&
    inRangeR1(r1) &&
    mForStep2 !== null &&
    inRangeM(mForStep2);

  // M-Punkt: gemeinsamer Punkt beider Konstruktionslinien
  const mPoint = mForStep2 ?? mFromTime;

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
          {/* === Titel der Skalen === */}
          <text
            x={X_D}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="13"
            fontWeight="bold"
          >
            {t('axisD')}
          </text>
          <text
            x={X_D}
            y={TOP - 24}
            textAnchor="middle"
            fill={fgSub}
            fontSize="10"
          >
            {t('axisDSub')}
          </text>

          <text
            x={X_R1}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="13"
            fontWeight="bold"
          >
            {t('axisR1')}
          </text>
          <text
            x={X_R1}
            y={TOP - 24}
            textAnchor="middle"
            fill={fgSub}
            fontSize="10"
          >
            {t('axisR1Sub')}
          </text>

          <text
            x={X_M}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="13"
            fontWeight="bold"
          >
            {t('axisPivot')}
          </text>
          <text
            x={X_M}
            y={TOP - 24}
            textAnchor="middle"
            fill={fgSub}
            fontSize="10"
          >
            {t('axisPivotSub')}
          </text>

          <text
            x={xTs(8)}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="13"
            fontWeight="bold"
          >
            {t('axisTs')}
          </text>
          <text
            x={xTs(8)}
            y={TOP - 24}
            textAnchor="middle"
            fill={fgSub}
            fontSize="10"
          >
            {t('axisTsSub')}
          </text>

          <text
            x={X_TE_TOP}
            y={TOP - 40}
            textAnchor="middle"
            fill={fg}
            fontSize="13"
            fontWeight="bold"
          >
            {t('axisTe')}
          </text>
          <text
            x={X_TE_TOP}
            y={TOP - 24}
            textAnchor="middle"
            fill={fgSub}
            fontSize="10"
          >
            {t('axisTeSub')}
          </text>

          {/* === Vertikale Achsen (D, R₁, M) === */}
          {[X_D, X_R1, X_M].map((x) => (
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

          {/* === Diagonale Te-Achse === */}
          <line
            x1={X_TE_TOP}
            y1={Y_TE_TOP}
            x2={X_TE_BOTTOM}
            y2={Y_TE_BOTTOM}
            stroke={fg}
            strokeWidth="1.5"
          />

          {/* === Gekrümmte Ts-Achse (als Polyline durch die Tick-Werte) === */}
          <polyline
            points={TS_TICKS.map((v) => `${xTs(v)},${yTs(v)}`).join(' ')}
            fill="none"
            stroke={fg}
            strokeWidth="1.5"
          />

          {/* === D-Ticks === */}
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
                  {fmtTick(v)}
                </text>
              </g>
            );
          })}

          {/* === R₁-Ticks === */}
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
                  {fmtTick(v)}
                </text>
              </g>
            );
          })}

          {/* === M-Ticks (Bezugslinie) === */}
          {M_TICKS.map((v) => {
            const y = yPivot(v);
            return (
              <g key={`m-${v}`}>
                <line
                  x1={X_M - 5}
                  y1={y}
                  x2={X_M + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_M - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtTick(v)}
                </text>
              </g>
            );
          })}

          {/* === Ts-Ticks (entlang der Kurve) === */}
          {TS_TICKS.map((v) => {
            const x = xTs(v);
            const y = yTs(v);
            return (
              <g key={`ts-${v}`}>
                <line
                  x1={x - 5}
                  y1={y}
                  x2={x + 5}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={x + 8}
                  y={y + 4}
                  textAnchor="start"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtTick(v)}
                </text>
              </g>
            );
          })}

          {/* === Te-Ticks (entlang der Diagonalen) === */}
          {TE_TICKS.map((v) => {
            const x = xTe(v);
            const y = yTe(v);
            // Senkrechte Tickmarken zur Diagonalen
            const dx = X_TE_BOTTOM - X_TE_TOP;
            const dy = Y_TE_BOTTOM - Y_TE_TOP;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len;
            const ny = dx / len;
            const tickLen = 5;
            return (
              <g key={`te-${v}`}>
                <line
                  x1={x - nx * tickLen}
                  y1={y - ny * tickLen}
                  x2={x + nx * tickLen}
                  y2={y + ny * tickLen}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={x + nx * (tickLen + 4)}
                  y={y + ny * (tickLen + 4) + 4}
                  textAnchor="start"
                  fill={fg}
                  fontSize="10"
                >
                  {fmtTick(v)}
                </text>
              </g>
            );
          })}

          {/* === Konstruktionslinien (gerade Linien) === */}

          {/* Schritt 1 (blau): Te → Ts → Bezugslinie M */}
          {showStep1 && (
            <line
              x1={xTe(te)}
              y1={yTe(te)}
              x2={X_M}
              y2={yPivot(mFromTime)}
              stroke={stepCol1}
              strokeWidth="2"
              strokeDasharray="6,3"
            />
          )}

          {/* Schritt 2 (rot): Bezugslinie M → R₁ → D */}
          {showStep2 && (
            <line
              x1={X_M}
              y1={yPivot(mForStep2)}
              x2={X_D}
              y2={yD(d)}
              stroke={stepCol2}
              strokeWidth="2"
              strokeDasharray="6,3"
            />
          )}

          {/* === Punkte === */}
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

          {mPoint !== null && inRangeM(mPoint) && (
            <>
              <ScalePoint
                cx={X_M}
                cy={yPivot(mPoint)}
                fill={computedCol}
                stroke={pointStroke}
                isComputed={true}
              />
              <text
                x={X_M + 14}
                y={yPivot(mPoint) - 8}
                textAnchor="start"
                fill={computedCol}
                fontSize="11"
                fontWeight="bold"
              >
                M = {fmtVal(mPoint, 3)}
              </text>
            </>
          )}

          {inRangeTs(ts) && (
            <>
              <ScalePoint
                cx={xTs(ts)}
                cy={yTs(ts)}
                fill={colorFor(tsIsComputed)}
                stroke={pointStroke}
                isComputed={tsIsComputed}
              />
              <text
                x={xTs(ts) + 18}
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

          {inRangeTe(te) && (
            <>
              <ScalePoint
                cx={xTe(te)}
                cy={yTe(te)}
                fill={colorFor(teIsComputed)}
                stroke={pointStroke}
                isComputed={teIsComputed}
              />
              <text
                x={xTe(te) + 18}
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

          {/* === Legende === */}
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
              strokeDasharray="6,3"
            />
            <text x={230} y={10} fill={fg} fontSize="11">
              {t('legendStep1')}
            </text>
            <line
              x1={380}
              y1={6}
              x2={404}
              y2={6}
              stroke={stepCol2}
              strokeWidth="2"
              strokeDasharray="6,3"
            />
            <text x={410} y={10} fill={fg} fontSize="11">
              {t('legendStep2')}
            </text>
          </g>
        </svg>
      </Box>
    </Box>
  );
}
