'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_OFFLINE_TILE_RADIUS,
  DEFAULT_OFFLINE_TILE_SOURCES,
  OFFLINE_TILE_MAX_TILES,
  OFFLINE_TILE_RADII,
  OFFLINE_TILE_SOURCES,
  planOfflineTiles,
} from '../../common/offlineTiles';
import useConnectivity from '../../hooks/useConnectivity';
import {
  clearOfflineTiles,
  countOfflineTiles,
  downloadOfflineTiles,
  OfflineTilesQuotaError,
  type OfflineTileProgress,
} from '../../lib/offlineTileDownload';
import { usePositionContext } from '../providers/PositionProvider';

type Phase = 'idle' | 'loading' | 'done' | 'aborted' | 'quota' | 'failed';

export interface OfflineMapPreparationProps {
  /** Einsatzort. Ohne ihn gilt der Standort des Geräts. */
  center?: { lat: number; lng: number };
}

/**
 * „Für offline vorbereiten": Kartenkacheln eines Gebiets um den Einsatzort
 * (oder den Standort) in den eigenen Cache `offline-tiles` laden.
 *
 * Nur basemap.at — warum, steht in `src/common/offlineTiles.ts` und
 * docs/kartenlayer.md. Muster ist das Vorladen des Höhenmodells
 * (`HoehenmodellOffline`): ein Knopf statt Precache, weil kein Gerät ungefragt
 * hundert Megabyte laden soll.
 */
export default function OfflineMapPreparation({
  center,
}: OfflineMapPreparationProps) {
  const t = useTranslations('offlineMap');
  const format = useFormatter();
  const { status } = useConnectivity();
  const [devicePosition, devicePositionSet, , enableLocation] =
    usePositionContext();

  const [radiusM, setRadiusM] = useState<number>(DEFAULT_OFFLINE_TILE_RADIUS);
  const [sourceIds, setSourceIds] = useState<string[]>(
    DEFAULT_OFFLINE_TILE_SOURCES
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<OfflineTileProgress | null>(null);
  const [stored, setStored] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const effectiveCenter = useMemo(() => {
    if (center) return center;
    if (devicePositionSet) {
      return { lat: devicePosition.lat, lng: devicePosition.lng };
    }
    return undefined;
  }, [center, devicePosition.lat, devicePosition.lng, devicePositionSet]);

  const plan = useMemo(
    () =>
      effectiveCenter
        ? planOfflineTiles({ center: effectiveCenter, radiusM, sourceIds })
        : undefined,
    [effectiveCenter, radiusM, sourceIds]
  );

  const refreshStored = useCallback(async () => {
    setStored(await countOfflineTiles());
  }, []);

  useEffect(() => {
    void refreshStored();
  }, [refreshStored]);

  // Beim Verlassen der Seite nicht im Hintergrund weiterladen.
  useEffect(() => () => abortRef.current?.abort(), []);

  const megabytes = (bytes: number) =>
    format.number(bytes / 1_000_000, { maximumFractionDigits: 1 });

  const start = useCallback(async () => {
    if (!plan || plan.tooLarge || plan.urls.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('loading');
    setProgress({
      total: plan.urls.length,
      done: 0,
      loaded: 0,
      failed: 0,
      skipped: 0,
      bytes: 0,
      aborted: false,
    });
    try {
      const result = await downloadOfflineTiles(plan.urls, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setProgress(result);
      setPhase(result.aborted ? 'aborted' : 'done');
    } catch (err) {
      if (err instanceof OfflineTilesQuotaError) {
        setPhase('quota');
      } else {
        console.error('Kartenkacheln konnten nicht vorgeladen werden', err);
        setPhase('failed');
      }
    } finally {
      abortRef.current = null;
      void refreshStored();
    }
  }, [plan, refreshStored]);

  const clear = useCallback(async () => {
    await clearOfflineTiles();
    setPhase('idle');
    setProgress(null);
    void refreshStored();
  }, [refreshStored]);

  const toggleSource = (id: string, checked: boolean) =>
    setSourceIds((ids) =>
      checked ? [...ids, id] : ids.filter((other) => other !== id)
    );

  const busy = phase === 'loading';
  const offline = status === 'offline';
  const canStart =
    !busy &&
    !offline &&
    !!plan &&
    !plan.tooLarge &&
    plan.tileCount > 0;

  return (
    <Box>
      <Typography variant="subtitle2">{t('title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('description')}
      </Typography>

      {effectiveCenter ? (
        <Typography variant="body2" sx={{ mb: 1 }}>
          {center ? t('centerFirecall') : t('centerDevice')}
        </Typography>
      ) : (
        <Alert
          severity="info"
          sx={{ mb: 1 }}
          action={
            <Button color="inherit" size="small" onClick={enableLocation}>
              {t('useLocation')}
            </Button>
          }
        >
          {t('noCenter')}
        </Alert>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' }, mb: 1 }}
      >
        <TextField
          select
          size="small"
          label={t('radius')}
          value={radiusM}
          disabled={busy}
          onChange={(e) => setRadiusM(Number(e.target.value))}
          sx={{ minWidth: 140 }}
        >
          {OFFLINE_TILE_RADII.map((r) => (
            <MenuItem key={r} value={r}>
              {r < 1000
                ? t('radiusMeters', { meters: r })
                : t('radiusKm', { km: r / 1000 })}
            </MenuItem>
          ))}
        </TextField>
        <FormGroup row>
          {OFFLINE_TILE_SOURCES.map((source) => (
            <FormControlLabel
              key={source.id}
              control={
                <Checkbox
                  size="small"
                  checked={sourceIds.includes(source.id)}
                  disabled={busy}
                  onChange={(e) => toggleSource(source.id, e.target.checked)}
                />
              }
              label={t(`layer.${source.id}` as 'layer.basemap_hdpi')}
            />
          ))}
        </FormGroup>
      </Stack>

      {plan && (
        <Typography variant="body2" color="text.secondary">
          {t('estimate', {
            count: plan.tileCount,
            size: Math.max(1, Math.round(plan.estimatedBytes / 1_000_000)),
          })}
        </Typography>
      )}
      {plan?.tooLarge && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {t('tooLarge', { max: OFFLINE_TILE_MAX_TILES })}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
        <Button
          variant="outlined"
          size="small"
          disabled={!canStart}
          onClick={() => void start()}
        >
          {t('start')}
        </Button>
        {busy && (
          <Button size="small" onClick={() => abortRef.current?.abort()}>
            {t('cancel')}
          </Button>
        )}
        {offline && !busy && (
          <Typography variant="caption" color="text.secondary">
            {t('offline')}
          </Typography>
        )}
      </Stack>

      {busy && progress && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t('progress', {
              done: progress.done,
              total: progress.total,
              size: megabytes(progress.bytes),
            })}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
          />
        </Box>
      )}

      {phase === 'done' && progress && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {t('done', {
            loaded: progress.loaded,
            skipped: progress.skipped,
            failed: progress.failed,
            size: megabytes(progress.bytes),
          })}
        </Typography>
      )}
      {phase === 'aborted' && progress && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {t('aborted', {
            loaded: progress.loaded,
            size: megabytes(progress.bytes),
          })}
        </Typography>
      )}
      {phase === 'quota' && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {t('quota')}
        </Alert>
      )}
      {phase === 'failed' && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {t('failed')}
        </Alert>
      )}

      {stored > 0 && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 1, alignItems: 'center' }}
        >
          <Typography variant="caption" color="text.secondary">
            {t('stored', { count: stored })}
          </Typography>
          <Button
            size="small"
            color="inherit"
            disabled={busy}
            onClick={() => void clear()}
          >
            {t('clear')}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
