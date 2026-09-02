'use client';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useFormatter, useTranslations } from 'next-intl';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import type { UeberwachungStand } from '../../common/atemschutzUeberwachung';
import {
  baueDruckVerlauf,
  type MarkeKey,
  type PunktArt,
} from './druckVerlaufModell';

/**
 * Der Druckverlauf eines Trupps als Kurve.
 *
 * Warum zusätzlich zur Zeilenliste: Aus Zahlen ist die **Steigung** nicht
 * abzulesen, und genau die ist die Frage am Einsatzort — wie schnell geht die
 * Luft weg, und reicht sie bis zur Marke? Die Kurve zeigt außerdem auf einen
 * Blick, ob der Trupp schneller verbraucht als der Anhaltswert der Unterlage:
 * Die durchgezogene Linie kommt dann vor der Marke „rechnerisches Ende" unten
 * an. Die Zeilen darüber bleiben — sie tragen die genauen Werte, die Kurve
 * trägt den Verlauf.
 *
 * Handgeschriebenes Inline-SVG wie `FoerderungProfileChart`: Für eine Linie mit
 * ein paar Marken ist eine Chart-Bibliothek im Bündel teurer als diese Datei,
 * und die Farben kommen aus der Palette, damit es im Dunkelmodus lesbar bleibt.
 */

const WIDTH = 600;
const HEIGHT = 190;
const PADDING = { top: 10, right: 10, bottom: 34, left: 34 };

export interface DruckVerlaufChartProps {
  trupp: AtemschutzTrupp;
  stand: UeberwachungStand;
  jetzt: Date;
}

/** Wie groß ein Messpunkt gezeichnet wird — die Meldungen fallen auf. */
const PUNKT_RADIUS: Record<PunktArt, number> = {
  abmarsch: 3.5,
  abfrage: 2.5,
  ziel: 4,
  rueckzug: 4,
  rueckkehr: 3.5,
};

export default function DruckVerlaufChart({
  trupp,
  stand,
  jetzt,
}: DruckVerlaufChartProps) {
  const t = useTranslations('atemschutz');
  const format = useFormatter();
  const theme = useTheme();

  const modell = baueDruckVerlauf(trupp, stand, jetzt);
  if (!modell) return null;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const spanne = modell.tEnde - modell.tStart;
  // Die Druckachse beginnt bei 0 und nicht am kleinsten Wert: Eine gestauchte
  // Achse macht aus einem harmlosen Verbrauch einen Sturz.
  const druckMax = Math.max(modell.druckMax, 1);

  const x = (zeitpunkt: number) =>
    PADDING.left + ((zeitpunkt - modell.tStart) / spanne) * plotWidth;
  const y = (druck: number) =>
    PADDING.top + plotHeight - (Math.max(0, druck) / druckMax) * plotHeight;

  const uhrzeit = (zeitpunkt: number) =>
    format.dateTime(new Date(zeitpunkt), {
      hour: '2-digit',
      minute: '2-digit',
    });

  const linie = modell.punkte
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t)} ${y(p.druck)}`)
    .join(' ');

  const markeFarbe: Record<MarkeKey, string> = {
    drittel: theme.palette.text.disabled,
    zweiDrittel: theme.palette.text.disabled,
    ende: theme.palette.warning.main,
    jetzt: theme.palette.info.main,
  };

  return (
    <Box sx={{ mt: 1, overflowX: 'auto' }}>
      <Box
        component="svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t('ueberwachung.druckverlaufChart')}
        sx={{ width: '100%', minWidth: 320, display: 'block' }}
      >
        {/* Waagrechte Schwellen: Rückzugsdruck und, wenn er darüber liegt, die
            Restdruckwarnung. Sie sind der Boden, auf den die Kurve zuläuft. */}
        {modell.linien.map((l) => (
          <g key={l.key}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(l.druck)}
              y2={y(l.druck)}
              stroke={
                l.key === 'rueckzug'
                  ? theme.palette.error.main
                  : theme.palette.warning.main
              }
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={PADDING.left + 2}
              y={y(l.druck) - 3}
              fontSize={9}
              fill={
                l.key === 'rueckzug'
                  ? theme.palette.error.main
                  : theme.palette.warning.main
              }
            >
              {t(
                `ueberwachung.chart.${l.key}` as 'ueberwachung.chart.rueckzug',
                { druck: Math.round(l.druck) },
              )}
            </text>
          </g>
        ))}

        {/* Senkrechte Marken: Drittel, zwei Drittel, rechnerisches Ende, jetzt. */}
        {modell.marken
          .filter((m) => m.t >= modell.tStart && m.t <= modell.tEnde)
          .map((m) => (
            <g key={m.key}>
              <line
                x1={x(m.t)}
                x2={x(m.t)}
                y1={PADDING.top}
                y2={PADDING.top + plotHeight}
                stroke={markeFarbe[m.key]}
                strokeWidth={m.key === 'jetzt' ? 1.5 : 1}
                strokeDasharray={m.key === 'jetzt' ? undefined : '2 3'}
              />
              <text
                x={x(m.t)}
                y={HEIGHT - 13}
                fontSize={9}
                textAnchor="middle"
                fill={markeFarbe[m.key]}
              >
                {t(
                  `ueberwachung.chart.${m.key}` as 'ueberwachung.chart.drittel',
                )}
              </text>
              <text
                x={x(m.t)}
                y={HEIGHT - 3}
                fontSize={9}
                textAnchor="middle"
                fill={theme.palette.text.secondary}
              >
                {uhrzeit(m.t)}
              </text>
            </g>
          ))}

        {/* Die Fortschreibung — gestrichelt, weil sie eine Annahme ist. */}
        {modell.prognose && (
          <line
            x1={x(modell.prognose.von.t)}
            y1={y(modell.prognose.von.druck)}
            x2={x(modell.prognose.bis.t)}
            y2={y(modell.prognose.bis.druck)}
            stroke={theme.palette.text.secondary}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        )}

        <path
          d={linie}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth={2}
        />

        {modell.punkte.map((p) => (
          <circle
            key={`${p.art}-${p.t}`}
            cx={x(p.t)}
            cy={y(p.druck)}
            r={PUNKT_RADIUS[p.art]}
            fill={theme.palette.primary.main}
          />
        ))}

        {/* Die Druckachse trägt nur die Enden: mehr Zahlen liest am Einsatzort
            niemand, und die Schwellen sind ohnehin beschriftet. */}
        <text
          x={PADDING.left - 4}
          y={y(druckMax) + 3}
          fontSize={9}
          textAnchor="end"
          fill={theme.palette.text.secondary}
        >
          {Math.round(druckMax)}
        </text>
        <text
          x={PADDING.left - 4}
          y={y(0)}
          fontSize={9}
          textAnchor="end"
          fill={theme.palette.text.secondary}
        >
          0
        </text>
      </Box>
    </Box>
  );
}
