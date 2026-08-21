'use client';

import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Portal from '@mui/material/Portal';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
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
import { ensureConnectionPendelRoute } from '../../FirecallItems/elements/connection/pendel/ensureConnectionPendelRoute';
import {
  pendelRoutingTodo,
  versorgungsart,
  type Versorgungsart,
} from '../../FirecallItems/elements/connection/pendel/pendelRoute';
import {
  pendelParams,
  pendelView,
  type PendelParams,
} from '../../FirecallItems/elements/connection/pendel/pendelverkehr';
import {
  versorgungVergleich,
  type VergleichAnnahmen,
} from '../../FirecallItems/elements/connection/pendel/versorgungVergleich';
import FoerderungSection from './FoerderungSection';
import PendelSection from './PendelSection';
import VergleichSection from './VergleichSection';
import { buildFoerderungDiaryEntry } from './foerderungDiaryEntry';
import { parseNumber, round } from './panelNumbers';

/**
 * Der Rechner für die Löschwasserversorgung an einer Leitung: Förderung über
 * lange Wegstrecke, Pendelverkehr und der Vergleich der beiden.
 *
 * Ein schwebendes Panel über der Karte, **nicht modal**: Beim Schieben des
 * Reglers wandern Pumpen und Fahrtroute auf der Karte mit, und genau das will
 * man dabei sehen. Ein bildschirmfüllender Dialog verdeckte die Karte — am
 * Handy war er von einer eigenen Seite nicht zu unterscheiden.
 *
 * Über einen Portal an `document.body` gehängt, damit Leaflet die Klicks im
 * Panel nicht als Kartenklicks sieht. Einklappbar, weil das Panel offen bleibt,
 * während man die Karte verschiebt.
 *
 * Hier steht nur der Rahmen: Kopfzeile, Modus, Förderrichtung, die geforderte
 * Menge und das Speichern. Was die jeweilige Variante beantwortet, steht in
 * `FoerderungSection`, `PendelSection` und `VergleichSection` — mit allen drei
 * in einer Datei wären es über 1200 Zeilen.
 *
 * Jede Änderung rechnet sofort neu, ohne zu speichern. Gespeichert wird mit
 * „Übernehmen" und beim Ablegen der Pumpen.
 */

const FLOW_MIN = 200;
const FLOW_MAX = 2000;
const FLOW_STEP = 50;

/**
 * Die Aufschriften stehen hier als Paare und nicht als `t(`mode_${value}`)`:
 * next-intl typisiert die Schlüssel statisch, ein zusammengesetzter Schlüssel
 * ist damit kein Schlüssel.
 */
const MODES: { value: Versorgungsart; label: 'modeRelay' | 'modeShuttle' | 'modeComparison' }[] = [
  { value: 'foerderung', label: 'modeRelay' },
  { value: 'pendel', label: 'modeShuttle' },
  { value: 'vergleich', label: 'modeComparison' },
];

export interface LoeschwasserfoerderungPanelProps {
  item: Connection;
  open: boolean;
  onClose: () => void;
}

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
  const [mode, setMode] = useState<Versorgungsart>(() => versorgungsart(item));
  const [reversed, setReversed] = useState(item.foerderungUmgekehrt === 'true');
  const [params, setParams] = useState<FoerderungParams>(() =>
    foerderungParams(item)
  );
  const [pendel, setPendel] = useState<PendelParams>(() => pendelParams(item));
  const [annahmen, setAnnahmen] = useState<Partial<VergleichAnnahmen>>(() => ({
    verlegeleistung: item.verlegeleistung,
    pumpenRuestzeit: item.pumpenRuestzeit,
  }));
  const [manualClimb, setManualClimb] = useState(item.hoehenunterschied ?? 0);
  const [placed, setPlaced] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [derivedBusy, setDerivedBusy] = useState(false);

  // Der Rechner arbeitet auf einer Kopie mit den Werten aus dem Panel: So
  // rechnet der Regler, ohne dass jede Bewegung nach Firestore geht.
  const draft = useMemo(
    () =>
      ({
        ...item,
        foerderung: enabled ? 'true' : 'false',
        foerderungUmgekehrt: reversed ? 'true' : 'false',
        versorgungsart: mode,
        hoehenunterschied: manualClimb,
      }) as Connection,
    [item, enabled, reversed, mode, manualClimb]
  );

  const view = useMemo(() => foerderungView(draft, params), [draft, params]);
  // Auch im Modus „Förderung" nicht gerechnet: Der Pendelverkehr braucht die
  // Fahrtroute, und die wird dort nicht abgefragt.
  const pendelResult = useMemo(
    () => pendelView(draft, pendel, params.foerderMenge),
    [draft, pendel, params.foerderMenge]
  );
  const vergleich = useMemo(
    () => versorgungVergleich(view, pendelResult, annahmen),
    [view, pendelResult, annahmen]
  );

  const set = <K extends keyof FoerderungParams>(
    key: K,
    value: FoerderungParams[K]
  ) => setParams((previous) => ({ ...previous, [key]: value }));

  const setPendelValue = <K extends keyof PendelParams>(
    key: K,
    value: PendelParams[K]
  ) => setPendel((previous) => ({ ...previous, [key]: value }));

  const setAnnahme = <K extends keyof VergleichAnnahmen>(
    key: K,
    value: number
  ) => setAnnahmen((previous) => ({ ...previous, [key]: value }));

  const persist = async () => {
    await updateItem({
      ...item,
      foerderung: enabled ? 'true' : 'false',
      foerderungUmgekehrt: reversed ? 'true' : 'false',
      versorgungsart: mode,
      ...params,
      pendelFahrzeuge: pendel.fahrzeuge,
      pendelTankinhalt: pendel.tankinhalt,
      pendelGeschwindigkeit: pendel.geschwindigkeit,
      pendelFuellzeit: pendel.fuellzeit,
      pendelEntleerzeit: pendel.entleerzeit,
      verlegeleistung: annahmen.verlegeleistung,
      pumpenRuestzeit: annahmen.pumpenRuestzeit,
      hoehenunterschied: manualClimb,
    } as Connection);
  };

  // Höhendaten und Fahrtroute kommen, sobald das Panel offen ist — nicht erst
  // nach dem Speichern. Beide hängen an Feldern am Element: die Höhen an
  // `foerderung === 'true'`, die Route zusätzlich an der Versorgungsart. Eine
  // gewöhnliche Leitung soll keine Abfrage kosten, und bis zum Einschalten gibt
  // es folglich keine. Genau das stand bisher als „keine Höhendaten" da, obwohl
  // es welche gibt.
  //
  // Zwei Wege, je nachdem, was am Element steht: Weicht der gespeicherte Stand
  // von dem im Panel ab, speichert das Panel — und `ensureConnectionDerived`
  // zieht dabei Straßenverlauf, Höhenprofil und Fahrtroute mit nach. Stimmt er,
  // fehlt nur das Abgeleitete, und das wird direkt geholt.
  //
  // `itemRef` statt `item` in den Abhängigkeiten: `item` ist bei jedem Render
  // ein neues Objekt (`record.data()`) und als Abhängigkeit eine Endlosschleife.
  const itemRef = useRef(item);
  itemRef.current = item;
  const runningRef = useRef(false);
  const storedItem = { ...item, foerderung: 'true', versorgungsart: mode };
  const storedMatches =
    item.foerderung === 'true' && versorgungsart(item) === mode;
  const needsElevation = elevationTodo(storedItem as Connection) === 'fetch';
  const needsPendelRoute =
    pendelRoutingTodo(storedItem as Connection) === 'route';

  useEffect(() => {
    if (!open || !enabled) return;
    if (storedMatches && !needsElevation && !needsPendelRoute) return;
    if (runningRef.current) return;

    let cancelled = false;
    runningRef.current = true;
    setDerivedBusy(true);
    (async () => {
      try {
        if (!storedMatches) {
          await persist();
        } else {
          const current = {
            ...itemRef.current,
            foerderung: 'true',
            versorgungsart: mode,
          } as Connection;
          if (needsElevation) {
            await ensureConnectionElevation(firecallId, current);
          }
          if (needsPendelRoute) {
            await ensureConnectionPendelRoute(firecallId, current);
          }
        }
      } catch (err) {
        console.error('unable to prepare versorgung', err);
      } finally {
        runningRef.current = false;
        if (!cancelled) setDerivedBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `persist` hängt an `item` und allen Panel-Werten und wäre bei jedem Render
    // neu; die Bedingungen oben sind vollständig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    enabled,
    mode,
    storedMatches,
    needsElevation,
    needsPendelRoute,
    firecallId,
  ]);

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
                {/* Welche Variante gerechnet wird, steht ganz oben: Die Frage
                    „Leitung legen oder pendeln?" kommt vor allen Zahlen. */}
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={mode}
                  onChange={(_event, value) =>
                    value !== null && setMode(value as Versorgungsart)
                  }
                  sx={{ mb: 1.5 }}
                >
                  {MODES.map(({ value, label }) => (
                    <ToggleButton key={value} value={value}>
                      {t(label)}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                {/* Die Richtung steht über den Zahlen: Eine Leitung wird
                    gezeichnet, wie es gerade passt, und ob es die Steigung
                    hinauf oder hinunter geht, entscheidet über die Pumpenzahl.
                    Beim Pendelverkehr entscheidet sie, welches Ende die
                    Entnahmestelle ist. */}
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

                {derivedBusy && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('elevationLoading')}
                    </Typography>
                    <LinearProgress />
                  </Box>
                )}

                {/* Die geforderte Menge gilt für beide Varianten — sie ist die
                    Anforderung an der Einsatzstelle und keine Eigenschaft eines
                    Fördermittels. Deshalb steht der Regler im Rahmen und nicht
                    in einer der Sektionen. */}
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

                {mode === 'foerderung' && (
                  <FoerderungSection
                    item={item}
                    view={view}
                    params={params}
                    onParamChange={set}
                    manualClimb={manualClimb}
                    onManualClimbChange={setManualClimb}
                    elevationBusy={derivedBusy}
                  />
                )}

                {mode === 'pendel' && pendelResult && (
                  <PendelSection
                    view={pendelResult}
                    params={pendel}
                    onParamChange={setPendelValue}
                    routeBusy={derivedBusy}
                  />
                )}

                {mode === 'vergleich' && (
                  <VergleichSection
                    vergleich={vergleich}
                    foerderung={view}
                    pendel={pendelResult}
                    annahmen={annahmen}
                    onAnnahmeChange={setAnnahme}
                  />
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
              {/* Nur, wo Pumpen gerechnet werden. Ein „Pumpen ablegen" im
                  Pendelverkehr legte Standorte einer Leitung ab, die gar nicht
                  gelegt wird.
                  Ein disabled Button braucht im Tooltip einen span-Wrapper,
                  sonst feuert er keine Events und MUI warnt. */}
              {mode !== 'pendel' && (
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
              )}
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
