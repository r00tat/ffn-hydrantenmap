'use client';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { LineChart } from '@mui/x-charts/LineChart';
import { useFormatter, useTranslations } from 'next-intl';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import type { UeberwachungStand } from '../../common/atemschutzUeberwachung';
import { baueDruckVerlauf, type MarkeKey } from './druckVerlaufModell';

/**
 * Der Druckverlauf eines Trupps als Kurve.
 *
 * Warum zusätzlich zur Zeilenliste: Aus Zahlen ist die **Steigung** nicht
 * abzulesen, und genau die ist die Frage am Einsatzort — wie schnell geht die
 * Luft weg, und reicht sie bis zur Marke? Die Kurve zeigt außerdem auf einen
 * Blick, ob der Trupp schneller verbraucht als der Anhaltswert der Unterlage:
 * Die durchgezogene Linie kommt dann vor der Marke „rechn. Ende" unten an. Die
 * Zeilen darüber bleiben — sie tragen die genauen Werte, die Kurve den Verlauf.
 *
 * Gezeichnet mit `@mui/x-charts`, wie die Wetterhistorie und die
 * Fahrtenbuch-Statistik: Zeitachse, Achsenbeschriftung, Tooltip und die
 * Referenzlinien für Schwellen und Marken sind dort fertig und im Bündel
 * ohnehin schon enthalten. Eine handgeschriebene SVG-Fläche war der erste
 * Versuch und brauchte für dasselbe mehr Höhe und eigene Beschriftungslogik.
 */

/** Niedrig gehalten: Die Karte trägt darüber schon Zahlen und Zeilen. */
const HOEHE = 150;

export interface DruckVerlaufChartProps {
  trupp: AtemschutzTrupp;
  stand: UeberwachungStand;
  jetzt: Date;
}

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

  const uhrzeit = (wert: Date) =>
    format.dateTime(wert, { hour: '2-digit', minute: '2-digit' });
  const bar = (wert: number | null) =>
    wert == null ? '–' : t('ueberwachung.bar', { druck: Math.round(wert) });

  /**
   * Die Stützstellen der Zeitachse: die Messzeitpunkte und das Ende der
   * Fortschreibung. Beide Reihen sind darauf ausgerichtet, `null` heißt „hier
   * kein Wert" — so liegt die gestrichelte Linie genau zwischen letztem
   * Messwert und Schwelle, ohne die durchgezogene zu verlängern.
   */
  const stuetzen = [
    ...new Set([
      ...modell.punkte.map((p) => p.t),
      ...(modell.prognose ? [modell.prognose.bis.t] : []),
    ]),
  ].sort((a, b) => a - b);

  const gemessen = stuetzen.map(
    (zeitpunkt) =>
      modell.punkte.find((p) => p.t === zeitpunkt)?.druck ?? null,
  );
  const prognose = modell.prognose;
  const fortgeschrieben = stuetzen.map((zeitpunkt) => {
    if (!prognose) return null;
    if (zeitpunkt === prognose.von.t) return prognose.von.druck;
    if (zeitpunkt === prognose.bis.t) return prognose.bis.druck;
    return null;
  });

  const markeFarbe: Record<MarkeKey, string> = {
    drittel: theme.palette.text.disabled,
    zweiDrittel: theme.palette.text.disabled,
    ende: theme.palette.warning.main,
    jetzt: theme.palette.info.main,
  };

  return (
    <Box
      role="img"
      aria-label={t('ueberwachung.druckverlaufChart')}
      sx={{ mt: 0.5 }}
    >
      <LineChart
        height={HOEHE}
        margin={{ top: 14, right: 8, bottom: 0, left: 0 }}
        hideLegend
        grid={{ horizontal: true }}
        xAxis={[
          {
            scaleType: 'time',
            data: stuetzen.map((zeitpunkt) => new Date(zeitpunkt)),
            // Feste Grenzen statt der Spanne der Messwerte: Die Marken für
            // Drittel und rechnerisches Ende liegen in der Zukunft und wären
            // sonst abgeschnitten.
            min: new Date(modell.tStart),
            max: new Date(modell.tEnde),
            valueFormatter: (wert: Date) => uhrzeit(wert),
            tickLabelStyle: { fontSize: 10 },
          },
        ]}
        yAxis={[
          {
            // Immer ab 0: Eine gestauchte Achse macht aus einem harmlosen
            // Verbrauch einen Sturz.
            min: 0,
            max: modell.druckMax,
            width: 34,
            tickLabelStyle: { fontSize: 10 },
          },
        ]}
        series={[
          {
            id: 'gemessen',
            data: gemessen,
            label: t('ueberwachung.chart.gemessen'),
            color: theme.palette.primary.main,
            connectNulls: true,
            valueFormatter: bar,
          },
          ...(prognose
            ? [
                {
                  id: 'prognose',
                  data: fortgeschrieben,
                  label: t('ueberwachung.chart.prognose'),
                  color: theme.palette.text.secondary,
                  connectNulls: true,
                  showMark: false,
                  valueFormatter: bar,
                },
              ]
            : []),
        ]}
        // Gestrichelt, weil die Fortschreibung eine Annahme ist und keine
        // Ablesung — dieselbe Unterscheidung wie in den Wetterdiagrammen.
        sx={{ '.MuiLineElement-series-prognose': { strokeDasharray: '5 4' } }}
      >
        {modell.linien.map((linie) => {
          const farbe =
            linie.key === 'rueckzug'
              ? theme.palette.error.main
              : theme.palette.warning.main;
          return (
            <ChartsReferenceLine
              key={linie.key}
              y={linie.druck}
              label={t(
                `ueberwachung.chart.${linie.key}` as 'ueberwachung.chart.rueckzug',
                { druck: Math.round(linie.druck) },
              )}
              labelAlign="start"
              lineStyle={{ stroke: farbe, strokeDasharray: '4 3' }}
              labelStyle={{ fontSize: 10, fill: farbe }}
            />
          );
        })}
        {modell.marken
          .filter((m) => m.t >= modell.tStart && m.t <= modell.tEnde)
          .map((marke) => (
            <ChartsReferenceLine
              key={marke.key}
              x={new Date(marke.t)}
              label={t(
                `ueberwachung.chart.${marke.key}` as 'ueberwachung.chart.drittel',
              )}
              // „jetzt" unten, die Fristen oben: Sonst stehen vier
              // Beschriftungen auf derselben Höhe übereinander.
              labelAlign={marke.key === 'jetzt' ? 'end' : 'start'}
              lineStyle={{
                stroke: markeFarbe[marke.key],
                strokeDasharray: marke.key === 'jetzt' ? undefined : '3 3',
              }}
              labelStyle={{ fontSize: 10, fill: markeFarbe[marke.key] }}
            />
          ))}
      </LineChart>
    </Box>
  );
}
