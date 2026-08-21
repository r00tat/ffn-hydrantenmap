'use client';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { FoerderungView } from '../../FirecallItems/elements/connection/foerderung/foerderung';

/**
 * Höhenprofil einer Leitung mit den vorgeschlagenen Pumpenstandorten.
 *
 * Handgeschriebenes Inline-SVG: Im Projekt ist keine Chart-Bibliothek, und für
 * ein einzelnes Flächendiagramm mit senkrechten Marken ist eine neue
 * Abhängigkeit teurer als diese Datei. Farben aus der Palette, damit es im
 * Dunkelmodus lesbar bleibt.
 */

const WIDTH = 600;
const HEIGHT = 160;
const PADDING = { top: 12, right: 8, bottom: 22, left: 40 };

export interface FoerderungProfileChartProps {
  view: FoerderungView;
}

export default function FoerderungProfileChart({
  view,
}: FoerderungProfileChartProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const theme = useTheme();

  const { profile, pumps } = view;
  if (profile.length < 2) return null;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const maxDistance = profile[profile.length - 1].distance || 1;
  const elevations = profile.map((point) => point.elevation);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  // Eine ebene Leitung hätte sonst keine Spanne und damit eine Division durch 0.
  const span = maxElevation - minElevation || 1;

  // Die Höhenachse trägt nur die Enden der Spanne. Bei einer ebenen Leitung —
  // etwa ohne Höhendaten und ohne eingegebenen Unterschied — sind beide Enden
  // dieselbe Zahl; dann steht sie einmal da. Zwei Marken mit gleichem Wert
  // wären auch zwei Kinder mit gleichem Schlüssel.
  const axisMarks =
    maxElevation === minElevation
      ? [{ id: 'flat', elevation: maxElevation }]
      : [
          { id: 'max', elevation: maxElevation },
          { id: 'min', elevation: minElevation },
        ];

  const x = (distance: number) =>
    PADDING.left + (distance / maxDistance) * plotWidth;
  const y = (elevation: number) =>
    PADDING.top + plotHeight - ((elevation - minElevation) / span) * plotHeight;

  const area = [
    `M ${x(0)} ${PADDING.top + plotHeight}`,
    ...profile.map((point) => `L ${x(point.distance)} ${y(point.elevation)}`),
    `L ${x(maxDistance)} ${PADDING.top + plotHeight}`,
    'Z',
  ].join(' ');

  const line = profile
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${x(point.distance)} ${y(point.elevation)}`
    )
    .join(' ');

  return (
    // Ein schmales Fenster darf das Diagramm scrollen, nicht die Seite.
    <Box sx={{ overflowX: 'auto', width: '100%' }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={t('profileChartLabel')}
        style={{ display: 'block', minWidth: 320 }}
      >
        <path d={area} fill={theme.palette.action.selected} />
        <path
          d={line}
          fill="none"
          stroke={theme.palette.text.secondary}
          strokeWidth={1.5}
        />

        {axisMarks.map(({ id, elevation }) => (
          <text
            key={id}
            x={PADDING.left - 6}
            y={y(elevation) + 4}
            textAnchor="end"
            fontSize={10}
            fill={theme.palette.text.secondary}
          >
            {Math.round(elevation)}
          </text>
        ))}

        {pumps.map((pump, index) => (
          <g key={`${pump.distance}-${index}`}>
            <line
              x1={x(pump.distance)}
              y1={PADDING.top}
              x2={x(pump.distance)}
              y2={PADDING.top + plotHeight}
              stroke={theme.palette.error.main}
              strokeWidth={1.5}
              strokeDasharray={index === 0 ? undefined : '3 2'}
            />
            <text
              x={x(pump.distance)}
              y={PADDING.top - 2}
              textAnchor="middle"
              fontSize={10}
              fill={theme.palette.error.main}
            >
              {index === 0 ? t('sourcePumpShort') : index}
            </text>
          </g>
        ))}

        {/* Die Achse läuft immer in Förderrichtung, deshalb stehen hier die
            Enden mit Namen und nicht bloß die Streckenmeter. */}
        <text
          x={PADDING.left}
          y={HEIGHT - 6}
          fontSize={10}
          fill={theme.palette.text.secondary}
        >
          {t('chartSource')} · 0 m
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 6}
          textAnchor="end"
          fontSize={10}
          fill={theme.palette.text.secondary}
        >
          {t('chartTarget')} · {Math.round(maxDistance)} m
        </text>
      </svg>
    </Box>
  );
}
