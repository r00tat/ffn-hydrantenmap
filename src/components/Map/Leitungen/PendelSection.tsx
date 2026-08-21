'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type {
  PendelParams,
  PendelView,
} from '../../FirecallItems/elements/connection/pendel/pendelverkehr';
import { parseNumber, round } from './panelNumbers';

/**
 * Der Pendelverkehr im Panel: Umlaufzeit, dauerhaft lieferbare Menge und die
 * Grenzen, an denen sie hängt.
 *
 * Oben der Regler für die Fahrzeugzahl und direkt darunter die Menge — derselbe
 * Aufbau wie bei der Förderung, und aus demselben Grund: Man will sehen, wie
 * die Antwort auf den Regler reagiert, ohne zu scrollen.
 */

const VEHICLE_MIN = 1;
const VEHICLE_MAX = 12;

export interface PendelSectionProps {
  view: PendelView;
  params: PendelParams;
  onParamChange: <K extends keyof PendelParams>(
    key: K,
    value: PendelParams[K]
  ) => void;
  /** Solange die Fahrtroute unterwegs ist, ist die Schätzung nur vorläufig. */
  routeBusy: boolean;
}

export default function PendelSection({
  view,
  params,
  onParamChange,
  routeBusy,
}: PendelSectionProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const result = view.result;

  return (
    <>
      <Typography variant="caption" color="text.secondary">
        {t('vehicles')}
      </Typography>
      <Grid container spacing={2} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 7 }}>
          <Slider
            value={Math.min(params.fahrzeuge, VEHICLE_MAX)}
            min={VEHICLE_MIN}
            max={VEHICLE_MAX}
            step={1}
            marks
            valueLabelDisplay="auto"
            aria-label={t('vehicles')}
            onChange={(_event, value) =>
              onParamChange('fahrzeuge', value as number)
            }
          />
        </Grid>
        <Grid size={{ xs: 5 }}>
          <TextField
            size="small"
            type="number"
            fullWidth
            label={t('vehicles')}
            value={params.fahrzeuge}
            onChange={(event) =>
              onParamChange(
                'fahrzeuge',
                parseNumber(event.target.value, params.fahrzeuge)
              )
            }
          />
        </Grid>
      </Grid>

      {result && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="h5">
            {t('shuttleFlow', { value: Math.round(result.menge) })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('cycleTime')}: {round(result.umlaufzeit)} {t('minute')}
          </Typography>
        </Box>
      )}

      {view.warnings
        // Solange die Route noch unterwegs ist, ist „geschätzt" bloß der
        // Zwischenstand und nicht die Aussage über das Ergebnis.
        .filter((warning) => !(routeBusy && warning === 'estimatedDistance'))
        .map((warning) => (
          <Alert
            key={warning}
            severity={warning === 'estimatedDistance' ? 'info' : 'warning'}
            sx={{ mt: 1.5 }}
          >
            {warning === 'estimatedDistance' && t('warningEstimatedDistance')}
            {warning === 'fillStationLimited' &&
              t('warningFillStationLimited', {
                value: Math.round(result?.fuellstellenLeistung ?? 0),
                vehicles: Math.floor(result?.fahrzeugeFuellstelle ?? 0),
              })}
            {warning === 'sollMengeNotReached' &&
              t('warningRequiredFlowMissed', {
                required: Math.round(view.sollMenge),
                vehicles: result?.fahrzeugeFuerSollmenge ?? 0,
              })}
            {warning === 'notComputable' && t('warningShuttleNotComputable')}
          </Alert>
        ))}

      {result && (
        <>
          <Alert
            severity={result.faltbehaelter ? 'warning' : 'success'}
            sx={{ mt: 1.5 }}
          >
            {result.faltbehaelter
              ? t('bufferNeeded', { vehicles: result.fahrzeugeOhnePuffer })
              : t('bufferNotNeeded')}
          </Alert>

          <Grid container spacing={1} sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('driveDistance')}
              </Typography>
              {/* `component="div"` wegen des Chips — siehe
                  FoerderungSection. */}
              <Typography variant="body2" component="div">
                {Math.round(view.strecke)} m
                {view.streckeSource === 'detour' && (
                  <Tooltip title={t('driveDistanceEstimatedHint')}>
                    <Chip
                      size="small"
                      label={t('driveDistanceEstimated')}
                      sx={{ ml: 0.5 }}
                    />
                  </Tooltip>
                )}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('driveTime')}
              </Typography>
              <Typography variant="body2">
                {round(result.fahrzeit)} {t('minute')}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('vehiclesForRequiredFlow')}
              </Typography>
              <Typography variant="body2">
                {result.fahrzeugeFuerSollmenge}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('tippingPoint')}
              </Typography>
              <Typography variant="body2">
                {result.kipppunkt !== undefined
                  ? t('tippingPointValue', {
                      metres: Math.round(result.kipppunkt),
                    })
                  : t('tippingPointNone')}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('firstWater')}
              </Typography>
              <Typography variant="body2">{t('firstWaterValue')}</Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('steadyAfter')}
              </Typography>
              <Typography variant="body2">
                {round(result.eingeschwungenNach)} {t('minute')}
              </Typography>
            </Grid>
          </Grid>
        </>
      )}

      <Divider sx={{ my: 2 }} />

      <Accordion disableGutters elevation={0}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">{t('moreValues')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('tankVolume')} (${t('litre')})`}
                value={params.tankinhalt}
                onChange={(event) =>
                  onParamChange(
                    'tankinhalt',
                    parseNumber(event.target.value, params.tankinhalt)
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('speed')} (${t('kmh')})`}
                value={params.geschwindigkeit}
                helperText={t('speedHint')}
                onChange={(event) =>
                  onParamChange(
                    'geschwindigkeit',
                    parseNumber(event.target.value, params.geschwindigkeit)
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('fillTime')} (${t('minute')})`}
                value={params.fuellzeit}
                // Die Leistung, die die Zeit bedeutet: Eine geänderte
                // Tankgröße macht eine stehengebliebene Zeit damit sichtbar,
                // statt sie still falsch zu lassen.
                helperText={t('rateHint', {
                  value: Math.round(params.tankinhalt / params.fuellzeit),
                })}
                onChange={(event) =>
                  onParamChange(
                    'fuellzeit',
                    parseNumber(event.target.value, params.fuellzeit)
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('emptyTime')} (${t('minute')})`}
                value={params.entleerzeit}
                helperText={t('rateHint', {
                  value: Math.round(params.tankinhalt / params.entleerzeit),
                })}
                onChange={(event) =>
                  onParamChange(
                    'entleerzeit',
                    parseNumber(event.target.value, params.entleerzeit)
                  )
                }
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    </>
  );
}
