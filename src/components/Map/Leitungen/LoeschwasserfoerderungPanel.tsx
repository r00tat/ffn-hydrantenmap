'use client';

import CloseIcon from '@mui/icons-material/Close';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Portal from '@mui/material/Portal';
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
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFirecallId } from '../../../hooks/useFirecall';
import useFirecallItemAdd from '../../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../../hooks/useFirecallItemUpdate';
import { useSnackbar } from '../../providers/SnackbarProvider';
import type { Connection, FcMarker } from '../../firebase/firestore';
import {
  foerderungParams,
  foerderungView,
  type FoerderungParams,
} from '../../FirecallItems/elements/connection/foerderung/foerderung';
import { elevationTodo } from '../../FirecallItems/elements/connection/foerderung/elevationProfile';
import { ensureConnectionElevation } from '../../FirecallItems/elements/connection/foerderung/ensureConnectionElevation';
import FoerderungProfileChart from './FoerderungProfileChart';
import { buildFoerderungDiaryEntry } from './foerderungDiaryEntry';

/**
 * Der Rechner für die Löschwasserförderung an einer Leitung.
 *
 * Ein schwebendes Panel über der Karte, **nicht modal**: Beim Schieben des
 * Reglers wandern die Pumpen auf der Leitung mit, und genau das will man dabei
 * sehen. Ein bildschirmfüllender Dialog verdeckte die Karte — am Handy war er
 * von einer eigenen Seite nicht zu unterscheiden.
 *
 * Über einen Portal an `document.body` gehängt, damit Leaflet die Klicks im
 * Panel nicht als Kartenklicks sieht. Einklappbar, weil das Panel offen bleibt,
 * während man die Karte verschiebt.
 *
 * Jede Änderung rechnet sofort neu, ohne zu speichern. Gespeichert wird mit
 * „Übernehmen" und beim Ablegen der Pumpen.
 */

const OUTPUT_PRESSURES = [6, 8, 10];
const FLOW_MIN = 200;
const FLOW_MAX = 2000;
const FLOW_STEP = 50;

export interface LoeschwasserfoerderungPanelProps {
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

export default function LoeschwasserfoerderungPanel({
  item,
  open,
  onClose,
}: LoeschwasserfoerderungPanelProps) {
  const t = useTranslations('loeschwasserfoerderung');
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  const firecallId = useFirecallId();
  const updateItem = useFirecallItemUpdate();
  const addItem = useFirecallItemAdd();
  const showSnackbar = useSnackbar();

  // Eingeschaltet, sobald der Rechner geöffnet wird: Wer ihn aufruft, will das
  // Ergebnis sehen und nicht erst einen Schalter finden. Der Schalter bleibt für
  // den umgekehrten Weg — den Rechner an dieser Leitung wieder abzuschalten.
  const [enabled, setEnabled] = useState(true);
  const [reversed, setReversed] = useState(item.foerderungUmgekehrt === 'true');
  const [params, setParams] = useState<FoerderungParams>(() =>
    foerderungParams(item)
  );
  const [manualClimb, setManualClimb] = useState(item.hoehenunterschied ?? 0);
  const [placed, setPlaced] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [elevationBusy, setElevationBusy] = useState(false);

  // Der Rechner arbeitet auf einer Kopie mit den Werten aus dem Panel: So
  // rechnet der Regler, ohne dass jede Bewegung nach Firestore geht.
  const view = useMemo(
    () =>
      foerderungView(
        {
          ...item,
          foerderung: enabled ? 'true' : 'false',
          foerderungUmgekehrt: reversed ? 'true' : 'false',
          hoehenunterschied: manualClimb,
        } as Connection,
        params
      ),
    [item, enabled, reversed, manualClimb, params]
  );

  const set = <K extends keyof FoerderungParams>(
    key: K,
    value: FoerderungParams[K]
  ) => setParams((previous) => ({ ...previous, [key]: value }));

  const persist = async () => {
    await updateItem({
      ...item,
      foerderung: enabled ? 'true' : 'false',
      foerderungUmgekehrt: reversed ? 'true' : 'false',
      ...params,
      hoehenunterschied: manualClimb,
    } as Connection);
  };

  // Höhendaten kommen, sobald das Panel offen ist — nicht erst nach dem
  // Speichern. Sie hängen an `foerderung === 'true'`: Eine gewöhnliche Leitung
  // soll keine Abfrage kosten, und bis zum Einschalten gibt es folglich keine.
  // Genau das stand bisher als „keine Höhendaten" da, obwohl es welche gibt.
  //
  // Zwei Wege, je nachdem, was am Element steht: Ist der Rechner noch nicht
  // gespeichert, speichert das Einschalten ihn — und `ensureConnectionDerived`
  // zieht dabei Straßenverlauf und Höhenprofil mit nach. Steht er schon, fehlt
  // nur das Profil, und das wird direkt geholt.
  //
  // `itemRef` statt `item` in den Abhängigkeiten: `item` ist bei jedem Render
  // ein neues Objekt (`record.data()`) und als Abhängigkeit eine Endlosschleife.
  const itemRef = useRef(item);
  itemRef.current = item;
  const runningRef = useRef(false);
  const storedEnabled = item.foerderung === 'true';
  const needsElevation =
    elevationTodo({ ...item, foerderung: 'true' } as Connection) === 'fetch';

  useEffect(() => {
    if (!open || !enabled) return;
    if (storedEnabled && !needsElevation) return;
    if (runningRef.current) return;

    let cancelled = false;
    runningRef.current = true;
    setElevationBusy(true);
    (async () => {
      try {
        if (!storedEnabled) {
          await persist();
        } else {
          await ensureConnectionElevation(firecallId, {
            ...itemRef.current,
            foerderung: 'true',
          } as Connection);
        }
      } catch (err) {
        console.error('unable to prepare foerderung', err);
      } finally {
        runningRef.current = false;
        if (!cancelled) setElevationBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `persist` hängt an `item` und allen Panel-Werten und wäre bei jedem Render
    // neu; die Bedingungen oben sind vollständig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enabled, storedEnabled, needsElevation, firecallId]);

  // Speichert und lässt das Panel offen: Es ist nicht modal, und wer die Werte
  // festhält, will meist weiter an der Lage arbeiten, nicht das Panel loswerden.
  const handleApply = async () => {
    await persist();
    showSnackbar(t('savedMessage'), 'success');
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
    showSnackbar(t('placedMessage', { count: view.pumps.length }), 'success');
  };

  if (!open) return null;

  const hasProfile = view?.elevationSource === 'profile';

  return (
    <Portal>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          // Über den Leaflet-Steuerelementen (z-index 1000), aber unter einem
          // echten Dialog (1300) — ein Bearbeiten-Dialog soll es verdecken.
          zIndex: theme.zIndex.drawer + 50,
          bottom: narrow ? 8 : 24,
          right: narrow ? 8 : 24,
          left: narrow ? 8 : 'auto',
          width: narrow ? 'auto' : 440,
          maxHeight: narrow ? '70vh' : '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 2,
            py: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            flexShrink: 0,
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {t('title')}
            </Typography>
            <Typography variant="caption" noWrap sx={{ display: 'block' }}>
              {item.name || t('subtitle')}
            </Typography>
          </Box>
          <Tooltip title={`${t('enable')} — ${t('enableHint')}`}>
            <Switch
              size="small"
              color="default"
              checked={enabled}
              slotProps={{ input: { 'aria-label': t('enable') } }}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </Tooltip>
          <Tooltip title={collapsed ? t('expand') : t('collapse')}>
            <IconButton
              size="small"
              color="inherit"
              aria-label={collapsed ? t('expand') : t('collapse')}
              onClick={() => setCollapsed((previous) => !previous)}
            >
              {collapsed ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t('close')}>
            <IconButton
              size="small"
              color="inherit"
              aria-label={t('close')}
              onClick={onClose}
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Collapse in={!collapsed} sx={{ overflowY: 'auto' }}>
          <Box sx={{ p: 2 }}>
            {!view && (
              <Typography variant="body2" color="text.secondary">
                {t('enableHint')}
              </Typography>
            )}

            {view && (
              <>
                {/* Die Richtung steht über allem anderen: Eine Leitung wird
                    gezeichnet, wie es gerade passt, und ob es die Steigung
                    hinauf oder hinunter geht, entscheidet über die
                    Pumpenzahl. */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('direction')}
                    </Typography>
                    <Typography variant="body2">
                      {t('directionPoints', {
                        from: view.reversed ? view.pointCount : 1,
                        to: view.reversed ? 1 : view.pointCount,
                      })}
                    </Typography>
                    {hasProfile && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {t('directionElevations', {
                          from: Math.round(view.profile[0].elevation),
                          to: Math.round(
                            view.profile[view.profile.length - 1].elevation
                          ),
                        })}
                      </Typography>
                    )}
                  </Box>
                  <Tooltip title={t('directionHint')}>
                    <Button
                      size="small"
                      startIcon={<SwapHorizIcon />}
                      // Sonst wird der Hinweis aus dem Tooltip zum
                      // Zugänglichkeitsnamen und verdeckt die Aufschrift.
                      aria-label={t('reverseDirection')}
                      onClick={() => setReversed((previous) => !previous)}
                    >
                      {t('reverseDirection')}
                    </Button>
                  </Tooltip>
                </Box>

                {elevationBusy && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('elevationLoading')}
                    </Typography>
                    <LinearProgress />
                  </Box>
                )}

                {/* Regler und Antwort stehen zusammen ganz oben: Der Zweck des
                    Panels ist, die Pumpenzahl auf die Literleistung reagieren zu
                    sehen. Alles Übrige liegt darunter oder in Aufklappern. */}
                <Typography variant="caption" color="text.secondary">
                  {t('flow')} ({t('flowUnit')})
                </Typography>
                <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                  <Grid size={{ xs: 7 }}>
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
                  <Grid size={{ xs: 5 }}>
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

                {view.result && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="h5">
                      {t('boosterPumps', {
                        count: view.result.verstaerkerpumpen,
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('endPressure')}: {round(view.result.enddruck)}{' '}
                      {t('bar')}
                    </Typography>
                  </Box>
                )}

                {/* Solange die Höhen noch unterwegs sind, wäre „keine
                    Höhendaten" bloß voreilig — der Ladehinweis oben sagt es
                    schon richtig. */}
                {view.warnings
                  .filter(
                    (warning) =>
                      !(elevationBusy && warning === 'noElevationData')
                  )
                  .map((warning) => (
                    <Alert
                      key={warning}
                      severity={
                        warning === 'noElevationData' ? 'info' : 'warning'
                      }
                      sx={{ mt: 1.5 }}
                    >
                      {warning === 'unknownDimension' &&
                        t('warningUnknownDimension', {
                          dimension: view.dimension,
                        })}
                      {warning === 'noElevationData' &&
                        t('warningNoElevationData')}
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
                        <Typography variant="body2">
                          {t('frictionPer100m', {
                            value: round(view.frictionPer100m ?? 0, 2),
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
                          {round(view.result.reibungsverlustBar)} {t('bar')}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography variant="caption" color="text.secondary">
                          {t('elevationTotal')}
                        </Typography>
                        <Typography variant="body2">
                          {round(view.result.hoehenverlustBar)} {t('bar')}
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
                    <Typography variant="body2">
                      {Math.round(view.length)} m
                    </Typography>
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
                    <Typography variant="body2">
                      {item.oneHozeLength || 20} m
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      size="small"
                      type="number"
                      fullWidth
                      disabled={hasProfile}
                      label={`${t('elevationDifference')} (${t('metre')})`}
                      value={hasProfile ? round(view.hoehenunterschied) : manualClimb}
                      onChange={(event) =>
                        setManualClimb(
                          parseNumber(event.target.value, manualClimb)
                        )
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
                    <Typography variant="subtitle2">
                      {t('moreValues')}
                    </Typography>
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
                        set('pumpenAusgangsdruck', value as number)
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
                            set(
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
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          size="small"
                          type="number"
                          fullWidth
                          label={`${t('pumpRating')} (${t('flowUnit')})`}
                          value={params.pumpenNennstrom}
                          onChange={(event) =>
                            set(
                              'pumpenNennstrom',
                              parseNumber(
                                event.target.value,
                                params.pumpenNennstrom
                              )
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
                    </Grid>
                  </AccordionDetails>
                </Accordion>

                {view.result && (
                  <Accordion disableGutters elevation={0}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle2">
                        {t('sections')}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0 }}>
                      <Box sx={{ overflowX: 'auto' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>{t('sectionFrom')}</TableCell>
                              <TableCell>{t('sectionTo')}</TableCell>
                              <TableCell align="right">
                                {t('sectionElevation')}
                              </TableCell>
                              <TableCell align="right">
                                {t('sectionLoss')}
                              </TableCell>
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
                                  {round(abschnitt.druckverlust)}
                                </TableCell>
                                <TableCell align="right">
                                  {round(abschnitt.enddruck)}
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
            )}
          </Box>
        </Collapse>

        {!collapsed && (
          <>
            <Divider />
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                p: 1,
                flexShrink: 0,
                justifyContent: 'flex-end',
              }}
            >
              {/* Ein disabled Button braucht im Tooltip einen span-Wrapper,
                  sonst feuert er keine Events und MUI warnt. */}
              <Tooltip title={t('placePumpsHint')}>
                <span>
                  <Button
                    size="small"
                    onClick={handlePlacePumps}
                    disabled={!view?.result || placed}
                  >
                    {placed ? t('placePumpsDone') : t('placePumps')}
                  </Button>
                </span>
              </Tooltip>
              <Button size="small" onClick={handleApply} variant="contained">
                {t('save')}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Portal>
  );
}
