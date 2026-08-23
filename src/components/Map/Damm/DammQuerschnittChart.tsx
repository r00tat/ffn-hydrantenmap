'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { DammbauView } from '../../FirecallItems/elements/damm/sandsack';

/**
 * Der Querschnitt des Dammes, maßstäblich gezeichnet.
 *
 * Handgeschriebenes Inline-SVG, wie `FoerderungProfileChart`: Im Projekt ist
 * keine Chart-Bibliothek, und für einen Umriss mit Sacklagen ist eine neue
 * Abhängigkeit teurer als diese Datei.
 *
 * **Gleicher Maßstab in x und y.** Das ist der ganze Sinn des Bildes: Die Frage
 * „was heißt Basisbreite 3 × Höhe?" beantwortet sich, wenn man die Böschung
 * sieht — und eine verzerrte Zeichnung beantwortet sie falsch. Ein flacher,
 * breiter Damm wird hier klein und breit dargestellt, nicht bildschirmfüllend.
 */

const WIDTH = 600;
const HEIGHT = 200;
const PADDING = { top: 26, right: 56, bottom: 26, left: 56 };

/**
 * Darüber werden die Lagen nicht mehr einzeln gezeichnet: Bei 10 cm Lagenhöhe
 * sind das schon 3 m Damm, und 30 Reihen Rechtecke sind kein Bild mehr, sondern
 * eine graue Fläche.
 */
const MAX_DRAWN_LAYERS = 30;

export interface DammQuerschnittChartProps {
  view: DammbauView;
}

export default function DammQuerschnittChart({
  view,
}: DammQuerschnittChartProps) {
  const t = useTranslations('dammbau');
  const theme = useTheme();

  const { bedarf, params, format } = view;
  const { basisbreite, kronenbreite } = bedarf.querschnitt;
  const hoehe = params.dammHoehe;

  if (!(hoehe > 0) || !(basisbreite > 0)) return null;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  // Ein Maßstab für beide Achsen, damit die Böschung stimmt. Die Breite muss
  // dabei die Fußsicherung der Folie mittragen (ein Meter wasserseitig), sonst
  // ragt sie aus dem Bild.
  const weltBreite = basisbreite + 1.2;
  const scale = Math.min(plotWidth / weltBreite, plotHeight / (hoehe * 1.15));

  const boden = PADDING.top + plotHeight;
  // Der Damm sitzt rechts vom Wasser und wird in der Fläche zentriert.
  const mitte = PADDING.left + plotWidth / 2 + (0.6 * scale) / 2;
  const x = (meter: number) => mitte + meter * scale;
  const y = (meter: number) => boden - meter * scale;

  const basisLinks = x(-basisbreite / 2);
  const basisRechts = x(basisbreite / 2);
  const kroneLinks = x(-kronenbreite / 2);
  const kroneRechts = x(kronenbreite / 2);
  const krone = y(hoehe);

  const umriss = [
    `M ${basisLinks} ${boden}`,
    `L ${kroneLinks} ${krone}`,
    `L ${kroneRechts} ${krone}`,
    `L ${basisRechts} ${boden}`,
    'Z',
  ].join(' ');

  /**
   * Die Sacklagen von unten nach oben. Jede Lage ist so breit, wie der Umriss
   * auf ihrer Höhe ist — dieselbe Interpolation, aus der die Querschnittsfläche
   * kommt.
   */
  // Die Lagenhöhe folgt aus dem verlegten Volumen und der Grundfläche des
  // Sackes: Ein voller gefüllter Sack liegt höher, ein größeres Format flacher.
  const grundflaeche = format.laenge * format.breite;
  const lagenHoehe =
    grundflaeche > 0 ? bedarf.verlegtesVolumen / grundflaeche : 0;
  const lagenZahl = lagenHoehe > 0 ? Math.ceil(hoehe / lagenHoehe) : 0;
  const lagen =
    lagenHoehe > 0 && lagenZahl <= MAX_DRAWN_LAYERS
      ? Array.from({ length: lagenZahl }, (_unused, index) => {
          const unten = index * lagenHoehe;
          const oben = Math.min(hoehe, unten + lagenHoehe);
          // Auf halber Lagenhöhe gemessen: Sonst stünde die unterste Reihe über
          // den Umriss hinaus.
          const anteil = Math.min(1, (unten + oben) / 2 / hoehe);
          const breite =
            basisbreite + (kronenbreite - basisbreite) * anteil;
          const saecke = Math.max(1, Math.round(breite / format.laenge));
          return { unten, oben, breite, saecke };
        })
      : [];

  const wasser = bedarf.wasserstand;

  return (
    <Box sx={{ overflowX: 'auto', width: '100%' }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={t('crossSectionChart')}
        style={{ display: 'block', minWidth: 320 }}
      >
        {/* Das Wasser auf der linken Seite, bis zum Wasserstand, den der Damm
            mit dem Freibord hält. */}
        {wasser > 0 && (
          <rect
            x={PADDING.left - 12}
            y={y(wasser)}
            width={Math.max(0, basisLinks - (PADDING.left - 12))}
            height={boden - y(wasser)}
            fill={theme.palette.info.main}
            opacity={0.22}
          />
        )}

        <path
          d={umriss}
          fill={theme.palette.action.selected}
          stroke={theme.palette.text.secondary}
          strokeWidth={1.5}
        />

        {lagen.map((lage) => (
          <g key={lage.unten}>
            {Array.from({ length: lage.saecke }, (_unused, index) => {
              const sackBreite = lage.breite / lage.saecke;
              const links = -lage.breite / 2 + index * sackBreite;
              return (
                <rect
                  key={index}
                  x={x(links)}
                  y={y(lage.oben)}
                  width={Math.max(1, sackBreite * scale)}
                  height={Math.max(1, (lage.oben - lage.unten) * scale)}
                  fill="none"
                  stroke={theme.palette.text.secondary}
                  strokeWidth={0.4}
                  opacity={0.7}
                  rx={Math.min(2, (sackBreite * scale) / 4)}
                />
              );
            })}
          </g>
        ))}

        {/* Die Folie auf der Wasserseite: über die Böschung, über die Krone und
            ein Meter Fußsicherung ins Wasser hinaus. */}
        <path
          d={[
            `M ${x(-basisbreite / 2 - 1)} ${boden}`,
            `L ${basisLinks} ${boden}`,
            `L ${kroneLinks} ${krone}`,
            `L ${kroneRechts} ${krone}`,
          ].join(' ')}
          fill="none"
          stroke={theme.palette.warning.main}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Geländelinie */}
        <line
          x1={PADDING.left - 12}
          y1={boden}
          x2={WIDTH - PADDING.right + 12}
          y2={boden}
          stroke={theme.palette.text.secondary}
          strokeWidth={1}
        />

        {/* Höhe mit Freibord: Der Strich am Wasserstand macht sichtbar, dass
            oben noch etwas übrig ist. */}
        {wasser > 0 && wasser < hoehe && (
          <line
            x1={basisLinks - 6}
            y1={y(wasser)}
            x2={kroneRechts + 6}
            y2={y(wasser)}
            stroke={theme.palette.info.dark}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}

        <text
          x={PADDING.left - 12}
          y={PADDING.top - 12}
          fontSize={10}
          fill={theme.palette.text.secondary}
        >
          {t('chartWaterSide')}
          {wasser > 0 ? ` · ${wasser.toFixed(2)} ${t('unitM')}` : ''}
        </text>

        <text
          x={x(0)}
          y={krone - 8}
          textAnchor="middle"
          fontSize={10}
          fill={theme.palette.text.secondary}
        >
          {t('crown')} {kronenbreite.toFixed(2)} {t('unitM')}
        </text>

        <text
          x={x(0)}
          y={boden + 14}
          textAnchor="middle"
          fontSize={10}
          fill={theme.palette.text.secondary}
        >
          {t('base')} {basisbreite.toFixed(2)} {t('unitM')}
        </text>

        <text
          x={basisRechts + 8}
          y={(krone + boden) / 2}
          fontSize={10}
          fill={theme.palette.text.secondary}
        >
          {hoehe.toFixed(2)} {t('unitM')}
        </text>

        {params.freibord > 0 && params.freibord < hoehe && (
          <text
            x={kroneRechts + 8}
            y={(krone + y(wasser)) / 2 + 3}
            fontSize={9}
            fill={theme.palette.info.dark}
          >
            {t('chartFreeboard')} {params.freibord.toFixed(2)}
          </text>
        )}
      </svg>

      {lagenZahl > MAX_DRAWN_LAYERS && (
        <Typography variant="caption" color="text.secondary">
          {t('chartTooManyLayers')}
        </Typography>
      )}
    </Box>
  );
}
