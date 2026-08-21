'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
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
import { useMemo, useState } from 'react';
import useFirecallItemAdd from '../../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../../hooks/useFirecallItemUpdate';
import type { Connection, FcMarker } from '../../firebase/firestore';
import {
  foerderungParams,
  foerderungView,
  type FoerderungParams,
} from '../../FirecallItems/elements/connection/foerderung/foerderung';
import FoerderungProfileChart from './FoerderungProfileChart';
import { buildFoerderungDiaryEntry } from './foerderungDiaryEntry';

/**
 * Der Rechner für die Löschwasserförderung an einer Leitung.
 *
 * Jede Änderung rechnet sofort neu, ohne zu speichern — das ist der Zweck:
 * sehen, wie die Pumpenzahl auf die Literleistung reagiert. Gespeichert wird
 * erst mit „Übernehmen" oder beim Ablegen der Pumpen.
 */

const OUTPUT_PRESSURES = [6, 8, 10];
const FLOW_MIN = 200;
const FLOW_MAX = 2000;
const FLOW_STEP = 50;

export interface LoeschwasserfoerderungDialogProps {
  item: Connection;
  open: boolean;
  onClose: () => void;
}

/** Eine Zahl aus einem Textfeld; leere Eingabe behält den alten Wert. */
const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value: number, digits = 1): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;

export default function LoeschwasserfoerderungDialog({
  item,
  open,
  onClose,
}: LoeschwasserfoerderungDialogProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const updateItem = useFirecallItemUpdate();
  const addItem = useFirecallItemAdd();

  const [enabled, setEnabled] = useState(item.foerderung === 'true');
  const [params, setParams] = useState<FoerderungParams>(() =>
    foerderungParams(item)
  );
  const [manualClimb, setManualClimb] = useState(item.hoehenunterschied ?? 0);
  const [placed, setPlaced] = useState(false);

  // Der Rechner arbeitet auf einer Kopie mit den Werten aus dem Dialog: So
  // rechnet der Regler, ohne dass jede Bewegung nach Firestore geht.
  const view = useMemo(
    () =>
      foerderungView(
        {
          ...item,
          foerderung: enabled ? 'true' : 'false',
          hoehenunterschied: manualClimb,
        } as Connection,
        params
      ),
    [item, enabled, manualClimb, params]
  );

  const set = <K extends keyof FoerderungParams>(
    key: K,
    value: FoerderungParams[K]
  ) => setParams((previous) => ({ ...previous, [key]: value }));

  const persist = async () => {
    await updateItem({
      ...item,
      foerderung: enabled ? 'true' : 'false',
      ...params,
      hoehenunterschied: manualClimb,
    } as Connection);
  };

  const handleApply = async () => {
    await persist();
    onClose();
  };

  const handlePlacePumps = async () => {
    if (!view?.result) return;

    // Die Pumpe an der Entnahmestelle wird mit abgelegt, aber als solche
    // benannt — sie ist keine Verstärkerpumpe.
    for (const [index, pump] of view.pumps.entries()) {
      const beschreibung = [
        `${t('pumpPopupDistance')}: ${Math.round(pump.distance)} m`,
        pump.eingangsdruck !== undefined
          ? `${t('pumpPopupInlet')}: ${round(pump.eingangsdruck)} bar`
          : undefined,
        `${t('pumpPopupOutlet')}: ${round(pump.ausgangsdruck)} bar`,
      ]
        .filter(Boolean)
        .join('\n');

      await addItem({
        type: 'marker',
        name:
          index === 0
            ? t('sourcePump')
            : t('boosterPumpNumber', { number: index }),
        beschreibung,
        lat: pump.position[0],
        lng: pump.position[1],
        layer: item.layer,
      } as FcMarker);
    }

    await addItem(
      buildFoerderungDiaryEntry({
        leitungName: item.name,
        view,
        timestamp: new Date().toISOString(),
        labels: {
          title: (name) => t('diaryTitle', { name }),
          flow: (value) => t('diaryFlow', { value }),
          pumps: (count) => t('diaryPumps', { count }),
          length: (metres, hoses) => t('diaryLength', { metres, hoses }),
          elevation: (metres) => t('diaryElevation', { metres }),
          friction: (bar) => t('diaryFriction', { bar: round(bar, 2) }),
          targetPressure: (bar) => t('diaryTargetPressure', { bar }),
          outputPressure: (bar) => t('diaryOutputPressure', { bar }),
          manualElevation: t('diaryManualElevation'),
          notFeasible: t('diaryNotFeasible'),
        },
      })
    );

    await persist();
    setPlaced(true);
  };

  const hasProfile = view?.elevationSource === 'profile';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('title')}
        <Typography variant="body2" color="text.secondary">
          {t('subtitle')}
          {item.name ? ` — ${item.name}` : ''}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          }
          label={t('enable')}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {t('enableHint')}
        </Typography>

        {view && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2">{t('situation')}</Typography>
            <Grid container spacing={1} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('length')}
                </Typography>
                <Typography>{Math.round(view.length)} m</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('dimension')}
                </Typography>
                <Typography>{view.dimension}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('hoseLength')}
                </Typography>
                <Typography>{item.oneHozeLength || 20} m</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('elevationDifference')}
                </Typography>
                <Typography>{round(view.hoehenunterschied)} m</Typography>
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary">
              {hasProfile
                ? t('elevationSourceProfile')
                : t('elevationSourceManual')}
            </Typography>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2">{t('inputs')}</Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t('flow')} ({t('flowUnit')})
              </Typography>
              <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                <Grid size={{ xs: 8, sm: 9 }}>
                  <Slider
                    value={params.foerderMenge}
                    min={FLOW_MIN}
                    max={FLOW_MAX}
                    step={FLOW_STEP}
                    marks={[
                      { value: 400, label: '400' },
                      { value: 800, label: '800' },
                      { value: 1200, label: '1200' },
                      { value: 1600, label: '1600' },
                    ]}
                    valueLabelDisplay="auto"
                    aria-label={t('flow')}
                    onChange={(_event, value) =>
                      set('foerderMenge', value as number)
                    }
                  />
                </Grid>
                <Grid size={{ xs: 4, sm: 3 }}>
                  <TextField
                    size="small"
                    type="number"
                    fullWidth
                    label={t('flow')}
                    value={params.foerderMenge}
                    onChange={(event) =>
                      set(
                        'foerderMenge',
                        parseNumber(event.target.value, params.foerderMenge)
                      )
                    }
                  />
                </Grid>
              </Grid>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t('outputPressure')} ({t('bar')})
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={params.pumpenAusgangsdruck}
                onChange={(_event, value) =>
                  value !== null && set('pumpenAusgangsdruck', value as number)
                }
                sx={{ display: 'block', mt: 0.5 }}
              >
                {OUTPUT_PRESSURES.map((pressure) => (
                  <ToggleButton key={pressure} value={pressure}>
                    {pressure} {t('bar')}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  label={`${t('targetPressure')} (${t('bar')})`}
                  value={params.zielDruck}
                  helperText={t('targetPressureHint')}
                  onChange={(event) =>
                    set(
                      'zielDruck',
                      parseNumber(event.target.value, params.zielDruck)
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  label={`${t('inputPressure')} (${t('bar')})`}
                  value={params.pumpenEingangsdruck}
                  onChange={(event) =>
                    set(
                      'pumpenEingangsdruck',
                      parseNumber(
                        event.target.value,
                        params.pumpenEingangsdruck
                      )
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  label={`${t('pumpRating')} (${t('flowUnit')})`}
                  value={params.pumpenNennstrom}
                  onChange={(event) =>
                    set(
                      'pumpenNennstrom',
                      parseNumber(event.target.value, params.pumpenNennstrom)
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  label={t('parallelLines')}
                  value={params.paralleleLeitungen}
                  helperText={t('parallelLinesHint')}
                  onChange={(event) =>
                    set(
                      'paralleleLeitungen',
                      parseNumber(
                        event.target.value,
                        params.paralleleLeitungen
                      )
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  disabled={hasProfile}
                  label={`${t('elevationDifference')} (${t('metre')})`}
                  value={manualClimb}
                  helperText={hasProfile ? t('elevationLockedHint') : undefined}
                  onChange={(event) =>
                    setManualClimb(parseNumber(event.target.value, manualClimb))
                  }
                />
              </Grid>
            </Grid>

            {view.warnings.map((warning) => (
              <Alert
                key={warning}
                severity={
                  warning === 'noElevationData' ? 'info' : 'warning'
                }
                sx={{ mt: 2 }}
              >
                {warning === 'unknownDimension' &&
                  t('warningUnknownDimension', { dimension: view.dimension })}
                {warning === 'noElevationData' && t('warningNoElevationData')}
                {warning === 'flowAbovePumpRating' &&
                  t('warningFlowAbovePumpRating', {
                    rating: params.pumpenNennstrom,
                  })}
                {warning === 'notFeasible' && t('warningNotFeasible')}
              </Alert>
            ))}

            {view.result && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2">{t('result')}</Typography>
                <Typography variant="h5" sx={{ mt: 1 }}>
                  {t('boosterPumps', {
                    count: view.result.verstaerkerpumpen,
                  })}
                </Typography>

                <Grid container spacing={1} sx={{ mt: 1 }}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('friction')}
                    </Typography>
                    <Typography>
                      {t('frictionPer100m', {
                        value: round(view.frictionPer100m ?? 0, 2),
                      })}
                      {!view.frictionTabulated && (
                        <Tooltip title={t('frictionDerivedHint')}>
                          <Chip
                            size="small"
                            label={t('frictionDerived')}
                            sx={{ ml: 1 }}
                          />
                        </Tooltip>
                      )}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('frictionTotal')}
                    </Typography>
                    <Typography>
                      {round(view.result.reibungsverlustBar)} {t('bar')}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('elevationTotal')}
                    </Typography>
                    <Typography>
                      {round(view.result.hoehenverlustBar)} {t('bar')}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('hoseCount')}
                    </Typography>
                    <Typography>
                      {t('hoseCountValue', {
                        count: view.hoseCount,
                        dimension: view.dimension,
                      })}
                    </Typography>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 2 }}>
                  <FoerderungProfileChart view={view} />
                </Box>

                <Typography variant="subtitle2" sx={{ mt: 2 }}>
                  {t('sections')}
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('sectionFrom')}</TableCell>
                        <TableCell>{t('sectionTo')}</TableCell>
                        <TableCell align="right">
                          {t('sectionElevation')}
                        </TableCell>
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
                          <TableCell>
                            {Math.round(abschnitt.vonMeter)} m
                          </TableCell>
                          <TableCell>
                            {Math.round(abschnitt.bisMeter)} m
                          </TableCell>
                          <TableCell align="right">
                            {round(abschnitt.hoehenunterschied)} m
                          </TableCell>
                          <TableCell align="right">
                            {round(abschnitt.druckverlust)} {t('bar')}
                          </TableCell>
                          <TableCell align="right">
                            {round(abschnitt.enddruck)} {t('bar')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 2 }}
                >
                  {t('source')}
                </Typography>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {/* Ein disabled Button braucht im Tooltip einen span-Wrapper, sonst
            feuert er keine Events und MUI warnt. */}
        <Tooltip title={t('placePumpsHint')}>
          <span>
            <Button
              onClick={handlePlacePumps}
              disabled={!view?.result || placed}
            >
              {placed ? t('placePumpsDone') : t('placePumps')}
            </Button>
          </span>
        </Tooltip>
        <Button onClick={handleApply} variant="contained">
          {t('apply')}
        </Button>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
