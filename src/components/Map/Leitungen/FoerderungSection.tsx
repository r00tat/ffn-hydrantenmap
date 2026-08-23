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
import type { Connection } from '../../firebase/firestore';
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
  manualClimb,
  onManualClimbChange,
  elevationBusy,
}: FoerderungSectionProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const num = usePanelNumber();
  const hasProfile = view.elevationSource === 'profile';

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
                {!view.frictionTabulated && (
                  <Tooltip title={t('frictionDerivedHint')}>
                    <Chip
                      size="small"
                      label={t('frictionDerived')}
                      sx={{ ml: 0.5 }}
                    />
                  </Tooltip>
                )}
              </Typography>
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
            {t('dimension')}
          </Typography>
          <Typography variant="body2">{view.dimension}</Typography>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <Typography variant="caption" color="text.secondary">
            {t('hoseLength')}
          </Typography>
          <Typography variant="body2">{item.oneHozeLength || 20} m</Typography>
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
        {hasProfile
          ? t('elevationSourceProfile')
          : t('elevationSourceManual')}
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
