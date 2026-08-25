'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLngPosition } from '../../../common/geo';
import { terrainClient } from '../../../common/terrain/terrainClient';
import {
  AUTO_DETAIL_MAX_M2,
  MIN_PLAUSIBLE_CELLS,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_STEP,
  wasserstandParams,
  wasserstandStale,
  ZUSCHLAG_MAX,
  ZUSCHLAG_MIN,
  ZUSCHLAG_STEP,
} from '../../../common/terrain/wasserstand';
import useFirecallItemUpdate from '../../../hooks/useFirecallItemUpdate';
import useWasserstandLauf from '../../../hooks/useWasserstandLauf';
import type { Wasserstand } from '../../firebase/firestore';
import { parseNumber, round } from '../panelNumbers';
import { wasserstandBasis } from './wasserstandAnlegen';
import WasserstandLegende from './WasserstandLegende';

/**
 * Der Rechner eines Wasserstands-Szenarios.
 *
 * Enthält den ganzen Zustand, aber **keinen eigenen Rahmen** — den gibt
 * `WasserstandPanel` über der Karte und die Seite „Hochwasser" daneben.
 * Gleiche Aufteilung wie `SandsackRechner`.
 *
 * Der Regler rechnet **nicht** live. Jeder Lauf lädt Kacheln, und ein Regler,
 * der beim Ziehen Megabyte zieht, ist im Hochwasserfall am Netz das Falsche.
 * Gerechnet wird auf „Berechnen", und das Ergebnis geht sofort ans Element —
 * es ist das Ergebnis des Elements, und alle in der Lageführung sollen es sehen.
 */

/** Mittlere Größe einer Detailkachel in MB, aus docs/hoehenmodell.md. */
const DETAIL_TILE_MB = 0.35;

export interface WasserstandRechnerProps {
  item: Wasserstand;
  /**
   * Gerade angelegt: einmal von selbst rechnen.
   *
   * Nur beim Anlegen und nur auf dem Gerät, das angelegt hat — sonst würde
   * jedes Gerät, das die Karte öffnet, Kacheln nachladen.
   */
  autoStart?: boolean;
}

export default function WasserstandRechner({
  item,
  autoStart,
}: WasserstandRechnerProps) {
  const t = useTranslations('wasserstand');
  const updateItem = useFirecallItemUpdate();
  const lauf = useWasserstandLauf();
  const params = useMemo(() => wasserstandParams(item), [item]);
  const [zuschlag, setZuschlag] = useState(params.zuschlag);
  const [radius, setRadius] = useState(params.radiusM);
  const [adria, setAdria] = useState<number>();

  const levelM =
    params.basisHoehe !== undefined ? params.basisHoehe + zuschlag : undefined;

  /**
   * Beschriftung des Umkreis-Reglers. Unter einem Kilometer in Metern — die
   * Vorbelegung liegt bei 500 m, und „0,5 km" liest sich schlechter als
   * „500 m". Darüber in km, damit die Zahl kurz bleibt.
   */
  const formatRadius = (value: number) =>
    value === 0
      ? t('radiusUnlimited')
      : value >= 1000
        ? `${(value / 1000).toFixed(1)} ${t('unitKilometers')}`
        : `${value} ${t('unitMeters')}`;

  /**
   * Der Saatpunkt, oder `undefined` — `lat`/`lng` sind an `FirecallItem`
   * optional. Ohne Ort gibt es weder eine Basishöhe noch einen Adria-Zuschlag.
   *
   * `useMemo`, damit das Tupel stabil bleibt: es hängt in den Abhängigkeiten
   * von `redetermineBase`, und ein bei jedem Rendern neu gebautes Array würde
   * den Callback jedes Mal erneuern.
   */
  const seed = useMemo<LatLngPosition | undefined>(
    () =>
      Number.isFinite(item.lat) && Number.isFinite(item.lng)
        ? [item.lat as number, item.lng as number]
        : undefined,
    [item.lat, item.lng]
  );

  // Der Zuschlag EVRF2000 → müA ist hier reine Anzeige: die Rechnung läuft über
  // Differenzen, der Versatz kürzt sich heraus. Gebraucht wird die Zahl, um sie
  // gegen einen Pegelwert zu halten.
  useEffect(() => {
    if (!seed) return;
    let alive = true;
    void (async () => {
      try {
        const [offset] = await terrainClient().adria([seed]);
        if (alive) setAdria(offset ?? undefined);
      } catch {
        if (alive) setAdria(undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, [seed]);

  const redetermineBase = useCallback(async () => {
    if (!seed) return;
    const basis = await wasserstandBasis(seed);
    if (!basis) return;
    await updateItem({ ...item, ...basis });
  }, [item, seed, updateItem]);

  const summary = lauf.state.summary;
  const running = lauf.state.phase === 'running';

  /**
   * Der Lauf beim Anlegen — genau einmal.
   *
   * Der Wächter ist ein Ref und keine Abhängigkeit: `lauf` ist bei jedem
   * Rendern ein neues Objekt, und ein Effekt, der daran hängt, würde in einer
   * Schleife rechnen.
   */
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoStart || autoDone.current) return;
    if (params.basisHoehe === undefined || item.wasserBaender) return;
    autoDone.current = true;
    void lauf.start(item, zuschlag, radius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, params.basisHoehe, item.wasserBaender]);
  const detailTiles = Math.max(
    1,
    Math.round((item.wasserFlaecheM2 ?? 0) / 1_000_000)
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ p: 2, overflowY: 'auto', flexGrow: 1 }}>
        <Typography variant="subtitle2">{t('base')}</Typography>
        {params.basisHoehe === undefined ? (
          <Alert severity="warning" sx={{ my: 1 }}>
            {t('baseMissing')}
          </Alert>
        ) : (
          <Typography variant="body2" component="div">
            {params.basisHoehe.toFixed(2)} m (EVRF2000)
            {params.basisStufe &&
              ` · ${t('baseLevel', {
                level: t(
                  params.basisStufe === 'detail'
                    ? 'levelDetail'
                    : 'levelOverview'
                ),
              })}`}
          </Typography>
        )}
        {params.basisStufe === 'overview' && (
          <Button size="small" onClick={() => void redetermineBase()}>
            {t('baseRedetermine')}
          </Button>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="subtitle2" gutterBottom>
          {t('surcharge')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Slider
            value={zuschlag}
            min={ZUSCHLAG_MIN}
            max={ZUSCHLAG_MAX}
            step={ZUSCHLAG_STEP}
            valueLabelDisplay="auto"
            onChange={(_event, value) => setZuschlag(value as number)}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            size="small"
            value={zuschlag}
            onChange={(event) =>
              setZuschlag(round(parseNumber(event.target.value, zuschlag), 2))
            }
            sx={{ width: 110 }}
            slotProps={{
              htmlInput: { 'aria-label': t('surcharge') },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {t('unitMeters')}
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        <Typography variant="subtitle2" sx={{ mt: 1.5 }} gutterBottom>
          {t('radius')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Slider
            value={radius}
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={RADIUS_STEP}
            valueLabelDisplay="auto"
            valueLabelFormat={formatRadius}
            onChange={(_event, value) => setRadius(value as number)}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            size="small"
            value={radius}
            onChange={(event) =>
              setRadius(round(parseNumber(event.target.value, radius), 0))
            }
            sx={{ width: 130 }}
            slotProps={{
              htmlInput: { 'aria-label': t('radius') },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {t('unitMeters')}
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" component="div">
          {radius === 0 ? t('radiusUnlimitedHint') : t('radiusHint')}
        </Typography>

        {levelM !== undefined && (
          <Typography variant="body2" color="text.secondary" component="div">
            {t('waterLevel', { value: levelM.toFixed(2) })}
            {adria !== undefined
              ? ` · ${t('waterLevelAdria', {
                  value: (levelM + adria).toFixed(2),
                })}`
              : ` · ${t('adriaUnavailable')}`}
          </Typography>
        )}

        {running && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="caption" color="text.secondary">
              {lauf.state.progress?.phase === 'bands'
                ? t('progressBands', {
                    blocks: lauf.state.progress.blocks,
                    total: lauf.state.progress.total ?? 0,
                  })
                : t('progressFill', {
                    blocks: lauf.state.progress?.blocks ?? 0,
                    cells: lauf.state.progress?.cells ?? 0,
                  })}
            </Typography>
          </Box>
        )}

        {lauf.state.phase === 'aborted' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {t('aborted')}
          </Alert>
        )}
        {lauf.state.phase === 'failed' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {lauf.state.error === 'noBase' ? t('warnNoBase') : t('failed')}
          </Alert>
        )}

        {summary?.reason === 'seedAboveLevel' && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('warnSeedAbove')}
          </Alert>
        )}
        {summary?.reason === 'seedNoData' && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('warnSeedNoData')}
          </Alert>
        )}
        {summary !== undefined &&
          summary.cells > 0 &&
          summary.cells < MIN_PLAUSIBLE_CELLS && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t('warnSeedShallow')}
            </Alert>
          )}

        {item.wasserAbbruch === 'radius' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {t('warnRadius', { value: item.wasserRadius ?? 0 })}
          </Alert>
        )}

        {wasserstandStale(item) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('stale')}
          </Alert>
        )}

        {item.wasserBaender && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" component="div">
              {t('resultArea', {
                value: ((item.wasserFlaecheM2 ?? 0) / 10000).toFixed(1),
              })}
              {' · '}
              {t('resultMaxDepth', {
                value: (item.wasserMaxTiefe ?? 0).toFixed(2),
              })}
              {' · '}
              {t('resultGrid', {
                value: item.wasserStufe === 'detail' ? 1 : 10,
              })}
            </Typography>
            {item.wasserStufe === 'overview' &&
              (item.wasserFlaecheM2 ?? 0) > AUTO_DETAIL_MAX_M2 && (
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ mt: 1 }}
                  disabled={running}
                  onClick={() => void lauf.refine(item, zuschlag, radius)}
                >
                  {t('refine')} —{' '}
                  {t('refineCost', {
                    tiles: detailTiles,
                    size: Math.round(detailTiles * DETAIL_TILE_MB),
                  })}
                </Button>
              )}
            <Box sx={{ mt: 2 }}>
              <WasserstandLegende
                item={item}
                adriaM={
                  levelM !== undefined && adria !== undefined
                    ? levelM + adria
                    : undefined
                }
              />
            </Box>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          p: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
          flexShrink: 0,
        }}
      >
        <Button
          variant="contained"
          disabled={running || params.basisHoehe === undefined || !seed}
          onClick={() => void lauf.start(item, zuschlag, radius)}
        >
          {running ? t('computing') : t('compute')}
        </Button>
        {running && (
          <Button variant="outlined" onClick={() => lauf.abort()}>
            {t('abort')}
          </Button>
        )}
      </Box>
    </Box>
  );
}
