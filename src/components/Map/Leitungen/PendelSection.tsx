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
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type {
  PendelParams,
  PendelView,
} from '../../FirecallItems/elements/connection/pendel/pendelverkehr';
import { parseNumber } from './panelNumbers';
import usePanelNumber from './usePanelNumber';

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
  /** Solange die Hydrantensuche läuft, ist „keiner in der Nähe" voreilig. */
  fuellstelleBusy: boolean;
  /** Die Leitung auf Fahrzeug-Routing umstellen. */
  onEnableVehicleRouting?: () => void;
}

export default function PendelSection({
  view,
  params,
  onParamChange,
  fuellstelleBusy,
  onEnableVehicleRouting,
}: PendelSectionProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const num = usePanelNumber();
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

      {/* Die Ergiebigkeit steht bei den Fahrzeugen und nicht im Aufklapper: Sie
          deckelt die Menge und ist damit genauso entscheidend wie ihre Zahl.
          Aus dem Hydranten in der Nähe, sonst von Hand — geraten wird sie
          nicht. */}
      <Grid container spacing={2} sx={{ alignItems: 'flex-start', mt: 1 }}>
        <Grid size={{ xs: 7 }}>
          <TextField
            size="small"
            type="number"
            fullWidth
            label={`${t('fillRate')} (${t('flowUnit')})`}
            value={params.fuellleistung ?? ''}
            placeholder={fuellstelleBusy ? t('fillRateSearching') : ''}
            helperText={
              view.fuellleistungSource === 'hydrant' && view.fuellstelle
                ? t('fillRateFromHydrant', {
                    name: view.fuellstelle.name,
                    metres: view.fuellstelle.distance,
                  })
                : view.fuellleistungSource === 'unknown'
                  ? t('fillRateNoHydrant')
                  : t('fillRateManual')
            }
            onChange={(event) =>
              onParamChange(
                'fuellleistung',
                parseNumber(event.target.value, params.fuellleistung ?? 0)
              )
            }
          />
        </Grid>
        <Grid size={{ xs: 5 }}>
          {view.fuellleistungSource === 'hydrant' && (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={t('fillRateHydrantChip')}
            />
          )}
        </Grid>
      </Grid>

      {result && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="h5">
            {t('shuttleFlow', { value: num(result.menge, 0) })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('cycleTime')}: {num(result.umlaufzeit)} {t('minute')}
          </Typography>
        </Box>
      )}

      {view.warnings
        // Solange die Route noch unterwegs ist, ist „geschätzt" bloß der
        // Zwischenstand und nicht die Aussage über das Ergebnis.
        .filter(
          (warning) => !(fuellstelleBusy && warning === 'fillRateMissing')
        )
        .map((warning) => (
          <Alert
            key={warning}
            severity={warning === 'notVehicleRouted' ? 'info' : 'warning'}
            sx={{ mt: 1.5 }}
            action={
              warning === 'notVehicleRouted' && onEnableVehicleRouting ? (
                <Button
                  size="small"
                  color="inherit"
                  onClick={onEnableVehicleRouting}
                >
                  {t('enableVehicleRouting')}
                </Button>
              ) : undefined
            }
          >
            {warning === 'notVehicleRouted' && t('warningNotVehicleRouted')}
            {warning === 'fillRateMissing' && t('warningFillRateMissing')}
            {warning === 'fillStationLimited' &&
              t('warningFillStationLimited', {
                value: num(result?.fuellstellenLeistung ?? 0, 0),
                vehicles: Math.floor(result?.fahrzeugeFuellstelle ?? 0),
              })}
            {warning === 'sollMengeNotReached' &&
              t('warningRequiredFlowMissed', {
                required: num(view.sollMenge, 0),
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
                {num(view.strecke, 0)} m
                {view.streckeSource === 'drawn' && (
                  <Tooltip title={t('driveDistanceDrawnHint')}>
                    <Chip
                      size="small"
                      label={t('driveDistanceDrawn')}
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
                {num(result.fahrzeit)} {t('minute')}
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
                      metres: num(result.kipppunkt, 0),
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
                {num(result.eingeschwungenNach)} {t('minute')}
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
                label={`${t('shuntTime')} (${t('minute')})`}
                value={params.rangierzeit}
                // Die Füllzeit ist gerechnet, nicht eingegeben: Tankinhalt
                // durch Ergiebigkeit plus diese Zeit. Der Hinweis nennt das
                // Ergebnis, damit die Zahl nachprüfbar bleibt.
                helperText={
                  result
                    ? t('fillTimeHint', { value: num(result.fuellzeit) })
                    : t('shuntTimeHint')
                }
                onChange={(event) =>
                  onParamChange(
                    'rangierzeit',
                    parseNumber(event.target.value, params.rangierzeit)
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
                  value: num(params.tankinhalt / params.entleerzeit, 0),
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
