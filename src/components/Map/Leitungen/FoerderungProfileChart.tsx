'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { LineChart } from '@mui/x-charts/LineChart';
import { useTranslations } from 'next-intl';
import type { FoerderungView } from '../../FirecallItems/elements/connection/foerderung/foerderung';
import { thinProfile } from './thinProfile';

/**
 * Höhenprofil einer Leitung mit den vorgeschlagenen Pumpenstandorten.
 *
 * Gezeichnet mit `@mui/x-charts`, wie der Druckverlauf der
 * Atemschutzüberwachung und die Wetterhistorie: Achsenteilung, Beschriftung,
 * Tooltip und die senkrechten Referenzlinien für die Pumpen sind dort fertig
 * und im Bündel ohnehin enthalten. Vorher stand hier ein handgeschriebenes
 * Inline-SVG — das brauchte für dasselbe eigene Skalierung, eigene
 * Achsenmarken und konnte keinen Wert unter dem Zeiger zeigen.
 *
 * **Die Fläche liegt auf der unteren Achsengrenze** (`baseline: 'min'`), nicht
 * auf 0: Die Höhen sind Meter über Adria, und ab 0 gezeichnet wäre jede
 * Leitung im Burgenland eine 130 m hohe Wand mit einer geraden Oberkante — die
 * Steigung, um die es geht, verschwindet darin.
 */

/** Niedrig gehalten: Das Profil sitzt im Seitenpanel unter den Kennzahlen. */
const HOEHE = 170;

export interface FoerderungProfileChartProps {
  view: FoerderungView;
}

export default function FoerderungProfileChart({
  view,
}: FoerderungProfileChartProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const theme = useTheme();

  const { pumps } = view;
  // Ausgedünnt, aber mit erhaltenen Hoch- und Tiefpunkten: mit der feinen
  // Abtastung kommen bis zu 5.000 Punkte an, und die Kuppen sind genau das,
  // was nicht verloren gehen darf. Siehe `thinProfile`.
  const profile = thinProfile(view.profile);
  if (profile.length < 2) return null;

  const distances = profile.map((point) => point.distance);
  const elevations = profile.map((point) => point.elevation);
  const maxDistance = distances[distances.length - 1] || 1;

  // Ganze Meter als Achsengrenzen, damit die Teilung runde Zahlen trägt. Eine
  // ebene Leitung — etwa ohne Höhendaten und ohne eingegebenen Unterschied —
  // hätte sonst keine Spanne und damit eine entartete Achse.
  const minElevation = Math.floor(Math.min(...elevations));
  const maxElevation = Math.ceil(Math.max(...elevations));
  const flach = minElevation === maxElevation;

  const meter = (wert: number) => `${Math.round(wert)} ${t('metre')}`;

  return (
    <Box>
      <Box role="img" aria-label={t('profileChartLabel')}>
        <LineChart
          height={HOEHE}
          margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
          hideLegend
          grid={{ horizontal: true }}
          xAxis={[
            {
              scaleType: 'linear',
              data: distances,
              min: 0,
              max: maxDistance,
              valueFormatter: (wert: number, ctx) =>
                ctx.location === 'tick' ? `${Math.round(wert)}` : meter(wert),
              tickLabelStyle: { fontSize: 10 },
            },
          ]}
          yAxis={[
            {
              min: flach ? minElevation - 1 : minElevation,
              max: flach ? maxElevation + 1 : maxElevation,
              width: 34,
              tickLabelStyle: { fontSize: 10 },
            },
          ]}
          series={[
            {
              id: 'elevation',
              data: elevations,
              label: t('chartElevation'),
              area: true,
              baseline: 'min',
              showMark: false,
              color: theme.palette.text.secondary,
              valueFormatter: (wert: number | null) =>
                wert == null ? '–' : meter(wert),
            },
          ]}
          // Die Fläche nur andeuten: Gefragt ist die Oberkante, nicht der Block
          // darunter.
          sx={{ '.MuiAreaElement-root': { fillOpacity: 0.15 } }}
        >
          {pumps.map((pump, index) => (
            <ChartsReferenceLine
              key={`${pump.distance}-${index}`}
              x={pump.distance}
              // Die Entnahmepumpe steht bei 0 und heißt nicht „0", sondern „E";
              // die Verstärkerpumpen werden ab 1 durchgezählt, wie in der Liste
              // und auf der Karte.
              label={index === 0 ? t('sourcePumpShort') : `${index}`}
              labelAlign="start"
              lineStyle={{
                stroke: theme.palette.error.main,
                strokeDasharray: index === 0 ? undefined : '3 2',
              }}
              labelStyle={{ fontSize: 10, fill: theme.palette.error.main }}
            />
          ))}
        </LineChart>
      </Box>

      {/* Die Achse läuft immer in Förderrichtung, deshalb stehen hier die Enden
          mit Namen und nicht bloß die Streckenmeter. */}
      <Box
        sx={{ display: 'flex', justifyContent: 'space-between', px: '34px' }}
      >
        <Typography variant="caption" color="text.secondary">
          {t('chartSource')} · 0 {t('metre')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('chartTarget')} · {meter(maxDistance)}
        </Typography>
      </Box>
    </Box>
  );
}
