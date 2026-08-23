'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { DammSumme } from '../../FirecallItems/elements/damm/dammSumme';
import type {
  DammWarning,
  DammbauView,
} from '../../FirecallItems/elements/damm/sandsack';
import { round } from '../panelNumbers';

/**
 * Was der Sandsackrechner ausgibt: Bedarf, Materialliste, Summe über alle
 * Abschnitte und die Warnungen.
 *
 * Rechnet selbst nichts — alles steht in `dammbauView` und `dammSumme`. Getrennt
 * von den Eingaben, weil das hier die Antwort auf die Materialanforderung ist:
 * Sie soll am Stück lesbar sein, ohne zwischen Reglern zu suchen.
 */

/**
 * Die Aufschriften stehen als Paare und nicht als `t(`warn${key}`)`: next-intl
 * typisiert die Schlüssel statisch, ein zusammengesetzter Schlüssel ist damit
 * kein Schlüssel.
 */
const WARN_LABELS: Record<
  DammWarning,
  | 'warnKeineStrecke'
  | 'warnEinfachZuHoch'
  | 'warnUeberTabelle'
  | 'warnFuellgradHoch'
  | 'warnSackZuSchwer'
  | 'warnFreibordUeberHoehe'
  | 'warnKeinPersonal'
  | 'warnZielzeitVerfehlt'
  | 'warnGeometrieStattTabelle'
> = {
  keineStrecke: 'warnKeineStrecke',
  einfachZuHoch: 'warnEinfachZuHoch',
  ueberTabelle: 'warnUeberTabelle',
  fuellgradHoch: 'warnFuellgradHoch',
  sackZuSchwer: 'warnSackZuSchwer',
  freibordUeberHoehe: 'warnFreibordUeberHoehe',
  keinPersonal: 'warnKeinPersonal',
  zielzeitVerfehlt: 'warnZielzeitVerfehlt',
  geometrieStattTabelle: 'warnGeometrieStattTabelle',
};

/** Nur ein Hinweis, keine Warnung: Da ist nichts falsch, nur anders gerechnet. */
const HINWEISE: DammWarning[] = ['keineStrecke', 'geometrieStattTabelle'];

export interface SandsackErgebnisProps {
  view: DammbauView;
  /** Alle Dammabschnitte der Lage; die Summe erscheint erst ab dem zweiten. */
  summe?: DammSumme;
}

/** Eine Zeile „Bezeichnung — Wert" in der dichten Ergebnistabelle. */
function Zeile({ label, value }: { label: string; value: string }) {
  return (
    <TableRow>
      <TableCell sx={{ px: 0, py: 0.4, border: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ px: 0, py: 0.4, border: 0 }}>
        <Typography variant="body2">{value}</Typography>
      </TableCell>
    </TableRow>
  );
}

function Abschnitt({ title }: { title: string }) {
  return (
    <Typography
      variant="subtitle2"
      sx={{ mt: 2, mb: 0.5 }}
      color="text.secondary"
    >
      {title}
    </Typography>
  );
}

export default function SandsackErgebnis({
  view,
  summe,
}: SandsackErgebnisProps) {
  const t = useTranslations('dammbau');
  const { bedarf, params } = view;

  const m = (value: number, digits = 1) =>
    `${round(value, digits)} ${t('unitM')}`;
  const stk = (value: number) => `${Math.round(value)} ${t('unitPieces')}`;

  // Die Verteilung der Kräfte auf die drei Tätigkeiten in einer Zeile: Wer die
  // Bauzeit halten will, muss wissen, wie viele ans Füllen und wie viele an die
  // Baustelle gehören.
  const verteilung = [
    `${t('splitFill')} ${bedarf.personalVerteilung.fuellen}`,
    `${t('splitTransport')} ${bedarf.personalVerteilung.transport}`,
    `${t('splitLay')} ${bedarf.personalVerteilung.verbauen}`,
  ].join(' · ');

  return (
    <Box>
      {bedarf.warnings.map((warning) => (
        <Alert
          key={warning}
          severity={HINWEISE.includes(warning) ? 'info' : 'warning'}
          sx={{ mt: 1.5 }}
        >
          {t(WARN_LABELS[warning])}
        </Alert>
      ))}

      <Abschnitt title={t('sectionBags')} />
      {/* Woher die Sackzahl kommt, steht über ihr: Tabelle oder Handeingabe ist
          der Unterschied zwischen einer belegten und einer gerechneten Zahl. */}
      <Typography variant="caption" color="text.secondary" component="div">
        {bedarf.saeckeSource === 'tabelle'
          ? `${t('sourceTable')} — ${t('tableReference')}`
          : t('sourceGeometry')}
      </Typography>
      <Table size="small">
        <TableBody>
          <Zeile label={t('bags')} value={stk(bedarf.saecke)} />
          <Zeile
            label={t('bagsPerMetre')}
            value={`${round(bedarf.saeckeProMeter)} ${t('unitPieces')}`}
          />
          <Zeile
            label={t('bagWeight')}
            value={`${round(bedarf.masseJeSack)} ${t('unitKg')}`}
          />
          <Zeile
            label={t('bagWeightWet')}
            value={`${round(bedarf.masseJeSackNass)} ${t('unitKg')}`}
          />
          <Zeile
            label={t('bagsPerCubicMetre')}
            value={stk(bedarf.saeckeJeKubikmeter)}
          />
          <Zeile
            label={t('sand')}
            value={`${round(bedarf.sandMasse)} ${t('unitT')} (${round(
              bedarf.sandVolumen
            )} ${t('unitM3')})`}
          />
          <Zeile
            label={t('crossSection')}
            value={`${round(bedarf.querschnitt.flaeche, 2)} ${t('unitM2')}`}
          />
          <Zeile
            label={t('base')}
            value={`${m(bedarf.querschnitt.basisbreite, 2)} / ${t(
              'crown'
            )} ${m(bedarf.querschnitt.kronenbreite, 2)}`}
          />
          <Zeile label={t('layers')} value={stk(bedarf.lagen)} />
        </TableBody>
      </Table>

      <Abschnitt title={t('sectionCrew')} />
      <Table size="small">
        <TableBody>
          <Zeile
            label={t('personHours')}
            value={`${round(bedarf.personenstunden)} ${t('unitH')}`}
          />
          <Zeile
            label={t('buildTime')}
            value={`${round(bedarf.bauzeit)} ${t('unitH')}`}
          />
          <Zeile
            label={t('throughput')}
            value={`${Math.round(bedarf.durchsatz)} ${t('unitPieces')}`}
          />
          <Zeile label={t('split')} value={verteilung} />
          <Zeile
            label={t('personnelForTarget')}
            value={`${bedarf.personalFuerZielzeit} ${t(
              'unitPersons'
            )} (${round(params.dammZielzeit)} ${t('unitH')})`}
          />
          <Zeile
            label={t('chainHelpers')}
            value={`${bedarf.kettenHelfer} ${t('unitPersons')}`}
          />
          {/* Die wirksamen Leistungswerte: Sie hängen an Truppgröße, Füllhilfe,
              Zubinden und Trageweite und sind deshalb keine Konstanten. */}
          <Zeile
            label={t('fillRate')}
            value={`${round(bedarf.leistung.fuellen)} ${t(
              'unitBagsPerHourPerson'
            )}`}
          />
          <Zeile
            label={t('transportRate')}
            value={`${round(bedarf.leistung.transport)} ${t(
              'unitBagsPerHourPerson'
            )}`}
          />
          <Zeile
            label={t('layRate')}
            value={`${round(bedarf.leistung.verbauen)} ${t(
              'unitBagsPerHourPerson'
            )}`}
          />
        </TableBody>
      </Table>

      <Abschnitt title={t('sectionMaterial')} />
      <Table size="small">
        <TableBody>
          {/* Angefordert wird die Menge **mit** Reserve — nachgefordert wird,
              was gebraucht wird, nicht das rechnerische Minimum. */}
          <Zeile
            label={`${t('materialBags')} (${t('bagsOrder')})`}
            value={stk(bedarf.saeckeBestellen)}
          />
          <Zeile
            label={t('materialSand')}
            value={`${round(bedarf.sandMasse)} ${t('unitT')}`}
          />
          <Zeile label={t('pallets')} value={stk(bedarf.paletten)} />
          <Zeile
            label={t('trucksBags')}
            value={stk(bedarf.lkwFuhrenSaecke)}
          />
          <Zeile
            label={t('materialTrucks')}
            value={stk(bedarf.lkwFuhrenSand)}
          />
          <Zeile
            label={t('materialFoil')}
            value={`${Math.round(bedarf.folieFlaeche)} ${t('unitM2')}`}
          />
          <Zeile
            label={t('materialShovels')}
            value={stk(bedarf.personalVerteilung.fuellen)}
          />
          <Zeile
            label={t('materialFunnels')}
            value={stk(Math.ceil(bedarf.personalVerteilung.fuellen / 2))}
          />
        </TableBody>
      </Table>

      {summe && summe.abschnitte.length > 1 && (
        <>
          <Divider sx={{ mt: 2 }} />
          <Abschnitt
            title={`${t('sectionTotal')} — ${t('totalSections', {
              count: summe.abschnitte.length,
            })}`}
          />
          <Table size="small">
            <TableBody>
              <Zeile label={t('totalLength')} value={m(summe.laenge, 0)} />
              <Zeile
                label={t('totalBags')}
                value={stk(summe.saeckeBestellen)}
              />
              <Zeile
                label={t('totalSand')}
                value={`${round(summe.sandMasse)} ${t('unitT')}`}
              />
              <Zeile label={t('pallets')} value={stk(summe.paletten)} />
              <Zeile
                label={t('totalTrucks')}
                value={stk(summe.lkwFuhrenSaecke)}
              />
              <Zeile
                label={t('totalFoil')}
                value={`${Math.round(summe.folieFlaeche)} ${t('unitM2')}`}
              />
              <Zeile
                label={t('totalPersonnel')}
                value={`${Math.round(summe.personal)} ${t('unitPersons')}`}
              />
              <Zeile
                label={t('totalBuildTime')}
                value={`${round(summe.bauzeit)} ${t('unitH')}`}
              />
            </TableBody>
          </Table>
        </>
      )}
    </Box>
  );
}
