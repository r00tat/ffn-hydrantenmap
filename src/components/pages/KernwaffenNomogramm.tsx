'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import {
  falloutDose,
  falloutDoseRate,
} from '../../common/strahlenschutz';

export interface KernwaffenNomogrammProps {
  /** Bezugsdosisleistung bei H+1 in mSv/h. */
  r1: number | null;
  /** Eintrittszeit nach Detonation in Stunden. */
  te: number | null;
  /** Aufenthaltsdauer in Stunden. */
  ts: number | null;
}

const VB_W = 720;
const VB_H = 520;
const TOP = 60;
const BOTTOM = 460;
const CHART_H = BOTTOM - TOP;
const X_LEFT = 100;
const X_MID = 360;
const X_RIGHT = 620;

const T_MIN = 0.1;
const T_MAX = 1000;
const F = (t: number) => Math.pow(t, -0.2);
const F_MAX = F(T_MIN); // ≈ 1.585
const F_MIN = F(T_MAX); // ≈ 0.251
const F_RANGE = F_MAX - F_MIN;
const SCALE_Y = CHART_H / F_RANGE;

function yLeft(te: number): number {
  return TOP + SCALE_Y * (F_MAX - F(te));
}
function yRight(ta: number): number {
  return TOP + SCALE_Y * (F(ta) - F_MIN);
}
function yMid(m: number): number {
  return TOP + CHART_H / 2 - (SCALE_Y * m) / 10;
}

const T_TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 500, 1000];
const M_TICKS = [0.05, 0.1, 0.2, 0.5, 1, 1.5, 2, 3, 4, 5, 6];

function formatTick(t: number): string {
  if (t >= 100) return String(t);
  if (t >= 1) return String(t);
  return t.toFixed(1).replace(/\.0$/, '');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function fmt(v: number, digits = 2): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(digits).replace(/\.?0+$/, '');
}

export default function KernwaffenNomogramm({
  r1,
  te,
  ts,
}: KernwaffenNomogrammProps) {
  const t = useTranslations('schadstoff.nomogramm');
  const theme = useTheme();
  const fg = theme.palette.text.primary;
  const fgSub = theme.palette.text.secondary;
  const lineCol = theme.palette.primary.main;
  const accent = theme.palette.warning.main;
  const grid = theme.palette.divider;

  const hasInputs =
    te !== null && te > 0 && ts !== null && ts > 0 && r1 !== null && r1 > 0;

  const ta = hasInputs ? te! + ts! : null;
  const m = hasInputs ? 5 * (F(te!) - F(ta!)) : null;
  const d = hasInputs ? falloutDose(r1!, te!, ts!) : null;
  const rAtTe = hasInputs ? falloutDoseRate(r1!, te!) : null;
  const rAtTa = hasInputs ? falloutDoseRate(r1!, ta!) : null;

  const teInRange = te !== null && te >= T_MIN && te <= T_MAX;
  const taInRange = ta !== null && ta >= T_MIN && ta <= T_MAX;
  const lineDrawable = hasInputs && teInRange && taInRange;

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
            y={TOP - 30}
            textAnchor="middle"
            fill={fg}
            fontSize="14"
            fontWeight="bold"
          >
            {t('axisTe')}
          </text>
          <text
            x={X_LEFT}
            y={TOP - 14}
            textAnchor="middle"
            fill={fgSub}
            fontSize="11"
          >
            {t('axisTeSub')}
          </text>
          <text
            x={X_MID}
            y={TOP - 30}
            textAnchor="middle"
            fill={fg}
            fontSize="14"
            fontWeight="bold"
          >
            {t('axisM')}
          </text>
          <text
            x={X_MID}
            y={TOP - 14}
            textAnchor="middle"
            fill={fgSub}
            fontSize="11"
          >
            {t('axisMSub')}
          </text>
          <text
            x={X_RIGHT}
            y={TOP - 30}
            textAnchor="middle"
            fill={fg}
            fontSize="14"
            fontWeight="bold"
          >
            {t('axisTa')}
          </text>
          <text
            x={X_RIGHT}
            y={TOP - 14}
            textAnchor="middle"
            fill={fgSub}
            fontSize="11"
          >
            {t('axisTaSub')}
          </text>

          {/* Axes */}
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

          {/* Left scale ticks: Te (top=0.1h, bottom=1000h) */}
          {T_TICKS.map((t) => {
            const y = yLeft(t);
            return (
              <g key={`l-${t}`}>
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
                  {formatTick(t)}
                </text>
              </g>
            );
          })}

          {/* Right scale ticks: Ta (top=1000h, bottom=0.1h) — INVERTED */}
          {T_TICKS.map((t) => {
            const y = yRight(t);
            return (
              <g key={`r-${t}`}>
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
                  {formatTick(t)}
                </text>
              </g>
            );
          })}

          {/* Middle scale ticks: M = D/R₁ */}
          {M_TICKS.map((mv) => {
            const y = yMid(mv);
            return (
              <g key={`m-${mv}`}>
                <line
                  x1={X_MID - 6}
                  y1={y}
                  x2={X_MID + 6}
                  y2={y}
                  stroke={fg}
                  strokeWidth="1"
                />
                <text
                  x={X_MID + 10}
                  y={y + 4}
                  textAnchor="start"
                  fill={fg}
                  fontSize="11"
                >
                  {formatTick(mv)}
                </text>
              </g>
            );
          })}

          {/* Connecting line: Te ↔ Ta */}
          {lineDrawable && (
            <>
              <line
                x1={X_LEFT}
                y1={yLeft(te!)}
                x2={X_RIGHT}
                y2={yRight(ta!)}
                stroke={lineCol}
                strokeWidth="2"
              />
              {/* Markers on the three scales */}
              <circle
                cx={X_LEFT}
                cy={yLeft(te!)}
                r={5}
                fill={lineCol}
                stroke={lineCol}
              />
              <circle
                cx={X_RIGHT}
                cy={yRight(ta!)}
                r={5}
                fill={lineCol}
                stroke={lineCol}
              />
              {m !== null && m >= 0 && (
                <circle
                  cx={X_MID}
                  cy={clamp(yMid(m), TOP - 10, BOTTOM + 10)}
                  r={6}
                  fill={accent}
                  stroke={accent}
                />
              )}
              {/* Result annotations */}
              <text
                x={X_LEFT - 10}
                y={yLeft(te!) - 8}
                textAnchor="end"
                fill={lineCol}
                fontSize="11"
                fontWeight="bold"
              >
                Te = {fmt(te!)} h
              </text>
              <text
                x={X_RIGHT + 10}
                y={yRight(ta!) - 8}
                textAnchor="start"
                fill={lineCol}
                fontSize="11"
                fontWeight="bold"
              >
                Tₐ = {fmt(ta!)} h
              </text>
              {m !== null && (
                <text
                  x={X_MID + 14}
                  y={clamp(yMid(m), TOP - 10, BOTTOM + 10) - 10}
                  textAnchor="start"
                  fill={accent}
                  fontSize="12"
                  fontWeight="bold"
                >
                  M = {fmt(m, 3)}
                </text>
              )}
            </>
          )}

          {/* Center zero-line indicator on M scale */}
          <line
            x1={X_MID - 10}
            y1={yMid(0)}
            x2={X_MID + 10}
            y2={yMid(0)}
            stroke={grid}
            strokeWidth="1"
            strokeDasharray="2,2"
          />

          {/* Bottom result panel */}
          {hasInputs && (
            <g>
              <rect
                x={20}
                y={VB_H - 50}
                width={VB_W - 40}
                height={42}
                fill="none"
                stroke={grid}
                rx={4}
              />
              <text
                x={32}
                y={VB_H - 30}
                fill={fg}
                fontSize="12"
                fontWeight="bold"
              >
                D = R₁ · M = {fmt(r1!)} · {fmt(m!, 3)} = {fmt(d!, 2)} mSv
              </text>
              <text x={32} y={VB_H - 14} fill={fgSub} fontSize="11">
                R(Te) = {fmt(rAtTe!, 2)} mSv/h &nbsp; · &nbsp; R(Tₐ) ={' '}
                {fmt(rAtTa!, 2)} mSv/h
              </text>
            </g>
          )}
        </svg>
      </Box>
    </Box>
  );
}
