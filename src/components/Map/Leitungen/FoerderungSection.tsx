'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Connection } from '../../firebase/firestore';
import { FALLBACK_SAMPLE_SPACING_M } from '../../FirecallItems/elements/connection/foerderung/elevationProfile';
import {
  canonicalDimension,
  HOSE_DIAMETERS,
  splitDimension,
} from '../../FirecallItems/elements/connection/foerderung/frictionLoss';
import type {
  FoerderungParams,
  FoerderungView,
} from '../../FirecallItems/elements/connection/foerderung/foerderung';
import FoerderungProfileChart from './FoerderungProfileChart';
import { parseNumber } from '../panelNumbers';
import usePanelNumber from './usePanelNumber';

/**
 * Die Förderung über lange Wegstrecke im Panel: Pumpenzahl, Drücke,
 * Höhenprofil und die Werte, die dahinter stehen.
 *
 * Herausgelöst aus dem Panel, als der Pendelverkehr dazukam — mit drei Modi in
 * einer Datei wären es über 1200 Zeilen. Der Rahmen (Kopfzeile, Modus,
 * Förderrichtung, Sollmenge, Speichern) bleibt im Panel; hier steht nur, was
 * die Förderung eigenhändig beantwortet.
 */

const OUTPUT_PRESSURES = [6, 8, 10];

/**
 * Die Knopfreihe des Querschnitts, aus derselben Aufzählung wie der Rechenkern
 * — zwei gepflegte Listen derselben Schläuche liefen auseinander. Sortiert nach
 * Durchmesser, damit die Reihe von grob nach fein läuft.
 */
const HOSE_CHOICES = Object.entries(HOSE_DIAMETERS).sort(
  ([, a], [, b]) => b - a
);

export interface FoerderungSectionProps {
  item: Connection;
  view: FoerderungView;
  /** Die Höhenabfrage von Hand erneut anstoßen. */
  onRetryElevation?: () => void;
  params: FoerderungParams;
  onParamChange: <K extends keyof FoerderungParams>(
    key: K,
    value: FoerderungParams[K]
  ) => void;
  /** Die Dimension der Leitung — kanonisch, also `'B'` oder `'C 42'`. */
  dimension: string;
  onDimensionChange: (value: string) => void;
  hoseLength: number;
  onHoseLengthChange: (value: number) => void;
  manualClimb: number;
  onManualClimbChange: (value: number) => void;
  /** Solange die Höhen unterwegs sind, wäre „keine Höhendaten" voreilig. */
  elevationBusy: boolean;
}

export default function FoerderungSection({
  item,
  view,
  onRetryElevation,
  params,
  onParamChange,
  dimension,
  onDimensionChange,
  hoseLength,
  onHoseLengthChange,
  manualClimb,
  onManualClimbChange,
  elevationBusy,
}: FoerderungSectionProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const num = usePanelNumber();
  const hasProfile = view.elevationSource === 'profile';

  // Buchstabe und Durchmesser getrennt bedient, am Element bleibt **ein**
  // Freitextfeld. Unlesbares („Storz") lässt beides leer — dann steht kein Knopf
  // gewählt, die Warnung bleibt, und ein Knopfdruck behebt sie.
  const { letter, diameterMm } = splitDimension(dimension);
  /**
   * Der Rohtext des mm-Felds.
   *
   * Nötig, weil „leer gilt als Standardwert" mit einem gesteuerten Feld
   * kollidiert: Ein geleertes Feld schrieb `'C'` ans Element, `splitDimension`
   * gab daraus wieder 52 zurück, das Feld füllte sich selbst — und die getippte
   * Zahl landete dahinter („C 5242"). Der Text führt also, das Element folgt.
   */
  const [diameterText, setDiameterText] = useState<string>();
  const modelActive = params.frictionModel === 'colebrook';
  const flowPerLine = params.foerderMenge / params.paralleleLeitungen;

  /**
   * Woher die Höhen kommen und wie fein abgetastet wurde.
   *
   * Der Satz nennt Quelle **und** Rasterweite: 10 m Übersichtsstufe ist ein
   * anderes Versprechen als 1 m, und wer eine Kuppe sucht, muss den
   * Unterschied kennen. Ohne die Angabe ist eine Abweichung gegenüber einem
   * früheren Ergebnis nicht zuordenbar.
   */
  const elevationSourceText = t(
    view.elevationOrigin === 'terrain'
      ? view.elevationLevel === 'overview'
        ? 'elevationSourceTerrainOverview'
        : 'elevationSourceTerrain'
      : 'elevationSourceProfile',
    { spacing: view.elevationSpacingM ?? FALLBACK_SAMPLE_SPACING_M }
  );

  return (
    <>
      {view.result && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="h5">
            {t('boosterPumps', { count: view.result.verstaerkerpumpen })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('endPressure')}: {num(view.result.enddruck)} {t('bar')}
          </Typography>
        </Box>
      )}

      {view.warnings
        // Solange die Höhen unterwegs sind, wäre beides voreilig — der
        // Ladehinweis oben sagt es schon richtig.
        .filter(
          (warning) =>
            !(
              elevationBusy &&
              (warning === 'noElevationData' || warning === 'elevationFailed')
            )
        )
        .map((warning) => (
          <Alert
            key={warning}
            severity={warning === 'noElevationData' ? 'info' : 'warning'}
            sx={{ mt: 1.5 }}
            // Ein Fehlschlag ist kein Endzustand: Der Höhendienst gibt keine
            // Verfügbarkeitszusage, und ein Aussetzer soll die Leitung nicht
            // für immer bei der Handeingabe lassen.
            action={
              warning === 'elevationFailed' && onRetryElevation ? (
                <Button size="small" color="inherit" onClick={onRetryElevation}>
                  {t('retryElevation')}
                </Button>
              ) : undefined
            }
          >
            {warning === 'unknownDimension' &&
              t('warningUnknownDimension', { dimension: view.dimension })}
            {warning === 'noElevationData' && t('warningNoElevationData')}
            {warning === 'elevationFailed' && t('warningElevationFailed')}
            {warning === 'flowAbovePumpRating' &&
              t('warningFlowAbovePumpRating', {
                rating: params.pumpenNennstrom,
              })}
            {warning === 'modelBelowTable' &&
              t('warningModelBelowTable', {
                model: num(view.frictionPer100m ?? 0, 2),
                table: num(view.frictionTableValue ?? 0, 2),
              })}
            {warning === 'notFeasible' && t('warningNotFeasible')}
          </Alert>
        ))}

      {view.result && (
        <>
          <Grid container spacing={1} sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('friction')}
              </Typography>
              {/* `component="div"`: Der Chip darunter ist ein `<div>`, und
                  `Typography` gäbe von sich aus ein `<p>` — ein div in einem p
                  ist ungültiges HTML und warnt bei der Hydration. */}
              <Typography variant="body2" component="div">
                {t('frictionPer100m', {
                  value: num(view.frictionPer100m ?? 0, 2),
                })}
                {/* Drei Herkünfte, zwei davon gekennzeichnet: Ein Wert aus der
                    belegten Tabelle trägt keinen Chip, ein abgeleiteter und ein
                    gerechneter je einen. Sonst würde eine Zahl aus der Formel
                    für einen Tabellenwert genommen. */}
                {view.frictionBreakdown?.source === 'derived' && (
                  <Tooltip title={t('frictionDerivedHint')}>
                    <Chip
                      size="small"
                      label={t('frictionModelDerived')}
                      sx={{ ml: 0.5 }}
                    />
                  </Tooltip>
                )}
                {view.frictionBreakdown?.source === 'model' && (
                  <Chip
                    size="small"
                    color="info"
                    label={t('frictionModelColebrook')}
                    sx={{ ml: 0.5 }}
                  />
                )}
              </Typography>
              {/* Aufschlüsselung und Tabellenwert nur beim Modell: Dort ist die
                  Zahl gerechnet und muss gegen die Unterlage einordenbar
                  bleiben. */}
              {view.frictionBreakdown?.source === 'model' && (
                <>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block' }}
                  >
                    {t('frictionSplit', {
                      rohr: num(view.frictionBreakdown.rohr, 2),
                      kupplungen: num(view.frictionBreakdown.kupplungen, 2),
                    })}
                  </Typography>
                  {view.frictionTableValue !== undefined && (
                    <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block' }}
                  >
                      {t('frictionTableComparison', {
                        value: num(view.frictionTableValue, 2),
                      })}
                    </Typography>
                  )}
                </>
              )}
            </Grid>
            {/* Die Schlauchzahl steht bei der Schlauchlänge unter „Lage" —
                dort wird sie eingestellt, und dort ist sie auch ohne Ergebnis
                zu sehen. */}
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('frictionTotal')}
              </Typography>
              <Typography variant="body2">
                {num(view.result.reibungsverlustBar)} {t('bar')}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('elevationTotal')}
              </Typography>
              <Typography variant="body2">
                {num(view.result.hoehenverlustBar)} {t('bar')}
              </Typography>
            </Grid>
          </Grid>

          <Box sx={{ mt: 1.5 }}>
            <FoerderungProfileChart view={view} />
          </Box>
        </>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2">{t('situation')}</Typography>
      <Grid container spacing={1} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 6 }}>
          <Typography variant="caption" color="text.secondary">
            {t('length')}
          </Typography>
          <Typography variant="body2">{num(view.length, 0)} m</Typography>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <Typography variant="caption" color="text.secondary">
            {t('hoseCount')}
          </Typography>
          <Typography variant="body2">
            {t('hoseCountValue', {
              count: view.hoseCount,
              dimension: view.dimension,
            })}
          </Typography>
        </Grid>

        {/* Der Querschnitt geht mit d⁵ in den Reibungsverlust ein und ist damit
            der wirksamste Wert überhaupt — er gehört bedienbar dorthin, wo er
            bisher nur ablesbar war. Eigene Zeile über die volle Breite: Fünf
            Knöpfe passen nicht in eine halbe Spalte. */}
        <Grid size={{ xs: 12 }}>
          <Typography variant="caption" color="text.secondary">
            {t('crossSection')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={letter ?? null}
            onChange={(_event, value) => {
              if (value === null) return;
              // Der Knopf setzt den Standardwert des Buchstabens; ein vorher
              // getippter Sonderdurchmesser gilt dann nicht weiter.
              setDiameterText(undefined);
              onDimensionChange(
                canonicalDimension(value as string, HOSE_DIAMETERS[value])
              );
            }}
            sx={{ display: 'block', mt: 0.5 }}
          >
            {HOSE_CHOICES.map(([key, mm]) => (
              <ToggleButton key={key} value={key}>
                {key} {mm}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            size="small"
            type="number"
            fullWidth
            label={`${t('innerDiameter')} (mm)`}
            value={diameterText ?? diameterMm ?? ''}
            // Ein leeres Feld gilt als Standardwert des Buchstabens und nicht
            // als 0 — sonst rechnete ein halb getippter Wert mit Durchmesser 0.
            onChange={(event) => {
              if (!letter) return;
              const text = event.target.value;
              setDiameterText(text);
              const mm = parseNumber(text, 0);
              // Erst ab zwei Ziffern ans Element: `hoseInnerDiameterMm` liest
              // nur zwei- bis dreistellige Durchmesser. Ein einstelliger
              // Zwischenstand („C 4") wäre unlesbar, und weil das mm-Feld an
              // einer lesbaren Dimension hängt, sperrte es sich beim Tippen
              // selbst — nach der ersten Ziffer ging keine zweite mehr hinein.
              onDimensionChange(
                canonicalDimension(letter, mm >= 10 ? mm : undefined)
              );
            }}
            disabled={!letter}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            size="small"
            type="number"
            fullWidth
            label={`${t('hoseLengthLabel')} (${t('metre')})`}
            value={hoseLength}
            onChange={(event) =>
              onHoseLengthChange(parseNumber(event.target.value, hoseLength))
            }
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          {/* Die Menge, mit der der Reibungswert nachgeschlagen wurde. Bei
              parallelen Leitungen ist das nicht die Sollmenge, und ohne die
              Angabe ist der Wert nicht nachzurechnen. */}
          <Typography variant="caption" color="text.secondary">
            {params.paralleleLeitungen > 1
              ? t('effectiveFlowPerLine', { flow: num(flowPerLine, 0) })
              : t('effectiveFlow', { flow: num(flowPerLine, 0) })}
          </Typography>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            size="small"
            type="number"
            fullWidth
            disabled={hasProfile}
            label={`${t('elevationDifference')} (${t('metre')})`}
            value={hasProfile ? num(view.hoehenunterschied) : manualClimb}
            onChange={(event) =>
              onManualClimbChange(parseNumber(event.target.value, manualClimb))
            }
          />
        </Grid>
      </Grid>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.5 }}
      >
        {hasProfile ? elevationSourceText : t('elevationSourceManual')}
      </Typography>
      {hasProfile && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {t('elevationLockedHint')}
        </Typography>
      )}

      <Accordion disableGutters elevation={0} sx={{ mt: 1.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">{t('moreValues')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="caption" color="text.secondary">
            {t('outputPressure')} ({t('bar')})
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={params.pumpenAusgangsdruck}
            onChange={(_event, value) =>
              value !== null &&
              onParamChange('pumpenAusgangsdruck', value as number)
            }
            sx={{ display: 'block', mt: 0.5, mb: 2 }}
          >
            {OUTPUT_PRESSURES.map((pressure) => (
              <ToggleButton key={pressure} value={pressure}>
                {pressure} {t('bar')}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {/* Die Modellwahl ist eine Grundsatzentscheidung, die man einmal
              trifft — kein Regler, an dem man im Einsatz probiert. Deshalb hier
              im Aufklapper. Dass sie aktiv ist, steht trotzdem immer sichtbar
              oben am Reibungswert. */}
          <Typography variant="caption" color="text.secondary">
            {t('frictionModelLabel')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={params.frictionModel}
            onChange={(_event, value) =>
              value !== null &&
              onParamChange(
                'frictionModel',
                value as FoerderungParams['frictionModel']
              )
            }
            sx={{ display: 'block', mt: 0.5, mb: 2 }}
          >
            <ToggleButton value="table">{t('frictionModelTable')}</ToggleButton>
            <ToggleButton value="colebrook">
              {t('frictionModelColebrook')}
            </ToggleButton>
          </ToggleButtonGroup>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                disabled={!modelActive}
                label={`${t('roughness')} (mm)`}
                value={params.rauheit}
                onChange={(event) =>
                  onParamChange(
                    'rauheit',
                    parseNumber(event.target.value, params.rauheit)
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              {/* Bei der Tabelle gesperrt, und der Hilfetext sagt warum: Die
                  Unterlage ist an echten Schlauchleitungen gemessen, die
                  Kupplungen stecken darin schon. Ein Aufschlag zählte doppelt. */}
              <TextField
                size="small"
                type="number"
                fullWidth
                disabled={!modelActive}
                label={`${t('couplingLoss')} (${t('bar')})`}
                value={params.kupplungsverlust}
                helperText={
                  modelActive ? t('couplingLossHint') : t('couplingLossTableHint')
                }
                onChange={(event) =>
                  onParamChange(
                    'kupplungsverlust',
                    parseNumber(event.target.value, params.kupplungsverlust)
                  )
                }
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('targetPressure')} (${t('bar')})`}
                value={params.zielDruck}
                helperText={t('targetPressureHint')}
                onChange={(event) =>
                  onParamChange(
                    'zielDruck',
                    parseNumber(event.target.value, params.zielDruck)
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('inputPressure')} (${t('bar')})`}
                value={params.pumpenEingangsdruck}
                onChange={(event) =>
                  onParamChange(
                    'pumpenEingangsdruck',
                    parseNumber(event.target.value, params.pumpenEingangsdruck)
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('pumpRating')} (${t('flowUnit')})`}
                value={params.pumpenNennstrom}
                onChange={(event) =>
                  onParamChange(
                    'pumpenNennstrom',
                    parseNumber(event.target.value, params.pumpenNennstrom)
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={t('parallelLines')}
                value={params.paralleleLeitungen}
                helperText={t('parallelLinesHint')}
                onChange={(event) =>
                  onParamChange(
                    'paralleleLeitungen',
                    parseNumber(event.target.value, params.paralleleLeitungen)
                  )
                }
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {view.result && (
        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">{t('sections')}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('sectionFrom')}</TableCell>
                    <TableCell>{t('sectionTo')}</TableCell>
                    <TableCell align="right">{t('sectionElevation')}</TableCell>
                    <TableCell align="right">{t('sectionLoss')}</TableCell>
                    <TableCell align="right">
                      {t('sectionEndPressure')}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {view.result.abschnitte.map((abschnitt) => (
                    <TableRow
                      key={`${abschnitt.vonMeter}-${abschnitt.bisMeter}`}
                    >
                      <TableCell>{num(abschnitt.vonMeter, 0)} m</TableCell>
                      <TableCell>{num(abschnitt.bisMeter, 0)} m</TableCell>
                      <TableCell align="right">
                        {num(abschnitt.hoehenunterschied)} m
                      </TableCell>
                      <TableCell align="right">
                        {num(abschnitt.druckverlust)}
                      </TableCell>
                      <TableCell align="right">
                        {num(abschnitt.enddruck)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </AccordionDetails>
        </Accordion>
      )}
    </>
  );
}
