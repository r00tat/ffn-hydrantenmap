'use client';

import CloseIcon from '@mui/icons-material/Close';
import NavigationIcon from '@mui/icons-material/Navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import { useTheme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { terrainClient } from '../../../common/terrain/terrainClient';
import type {
  TerrainBoundsLatLng,
  TerrainMesh,
} from '../../../common/terrain/terrainTypes';
import type { FirecallItem } from '../../firebase/firestore';
import { getItemInstance } from '../../FirecallItems/elements';
import { contourColor } from '../layers/hoehenlinien';
import {
  chooseExaggeration,
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  EXAGGERATION_STEP,
  meshBudget,
  texturePx,
} from './gelaende3d';
import {
  createGelaende3dScene,
  type Gelaende3dScene,
} from './gelaende3dScene';
import {
  connectionPaths,
  contourPaths,
  markerPlacements,
  pumpPlacements,
  sceneProjector,
} from './sceneObjects';
import { composeTexture, findLayerConfig, tileGrid } from './terrainTexture';

/**
 * Die 3D-Ansicht des Geländes.
 *
 * Wird über `next/dynamic` geladen; `three` liegt damit in einem eigenen Chunk
 * und nicht im Hauptbundle. Solange der Dialog zu ist, kostet die Ansicht
 * nichts — weder Kacheln noch Speicher.
 */

export interface Gelaende3dDialogOptions {
  open: boolean;
  onClose: () => void;
  bounds: TerrainBoundsLatLng;
  zoom: number;
  /** Angezeigter Name des aktiven Kartenlayers. */
  baseLayerName?: string;
  items: FirecallItem[];
  equidistanceM: number;
}

type Status = 'loading' | 'ready' | 'empty' | 'failed' | 'noWebgl';

/** Name und Symbol eines Einsatzobjekts aus dem Elementregister. */
const markerLook = (item: FirecallItem) => {
  const instance = getItemInstance(item);
  return {
    name: instance.title(),
    iconUrl: instance.icon().options.iconUrl ?? '',
  };
};

export default function Gelaende3dDialog({
  open,
  onClose,
  bounds,
  zoom,
  baseLayerName,
  items,
  equidistanceM,
}: Gelaende3dDialogOptions) {
  const t = useTranslations('gelaende3d');
  const theme = useTheme();
  const sceneRef = useRef<Gelaende3dScene | undefined>(undefined);
  /**
   * Das Canvas als Zustand und nicht als `useRef`.
   *
   * MUIs `Modal` hängt seine Kinder erst einen Render nach dem Öffnen ein. Mit
   * einer gewöhnlichen Ref wäre sie beim ersten Lauf des Effekts noch leer, und
   * der Effekt liefe nie wieder — die Ansicht bliebe beim Ladekreis stehen.
   */
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<Status>('loading');
  const [mesh, setMesh] = useState<TerrainMesh | undefined>();
  const [exaggeration, setExaggeration] = useState(1);
  const [showContours, setShowContours] = useState(true);
  const [azimuth, setAzimuth] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !canvas) return;

    let scene: Gelaende3dScene;
    try {
      scene = createGelaende3dScene(canvas);
    } catch (err) {
      console.error('3D-Ansicht: kein WebGL', err);
      setStatus('noWebgl');
      return;
    }
    sceneRef.current = scene;
    scene.onAzimuth(setAzimuth);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      scene.resize(rect.width, rect.height);
    };
    resize();
    // Ein `ResizeObserver` und nicht `window.resize`: der Dialog blendet auf,
    // und beim ersten Lauf hat das Canvas noch keine Fläche. Ohne die
    // Beobachtung bliebe das Bild leer, bis jemand das Fenster anfasst.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(resize);
    observer?.observe(canvas);

    let cancelled = false;

    void (async () => {
      setStatus('loading');
      try {
        const screenWidth = window.innerWidth;
        const result = await terrainClient().mesh(
          bounds,
          meshBudget(screenWidth)
        );
        if (cancelled) return;
        if (!result) {
          setStatus('empty');
          return;
        }
        setMesh(result);
        scene.setMesh(result);

        const factor = chooseExaggeration(
          result.maxM - result.minM,
          result.widthM
        );
        setExaggeration(factor);
        scene.setExaggeration(factor);

        const projector = sceneProjector(result);
        scene.setMarkers(
          markerPlacements(items, projector, markerLook),
          result.widthM
        );
        scene.setPaths(connectionPaths(items, projector), 0x2196f3, 4);
        scene.setPumps(pumpPlacements(items, projector));
        setStatus('ready');

        const config = findLayerConfig(baseLayerName);
        if (config) {
          const grid = tileGrid(bounds, zoom, config, texturePx(screenWidth));
          const texture = await composeTexture(config, grid);
          if (!cancelled) scene.setTexture(texture, result, grid);
        }

        const contours = await terrainClient().contours(bounds, equidistanceM);
        if (cancelled) return;
        const dark = theme.palette.mode === 'dark';
        const min = contours.minM ?? result.minM;
        const max = contours.maxM ?? result.maxM;
        scene.setContours(contourPaths(contours.lines, projector), (heightM) =>
          contourColor(heightM, min, max, dark)
        );
      } catch (err) {
        console.error('3D-Ansicht konnte nicht aufgebaut werden', err);
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      // Ohne diese Freigabe sammelt sich über wenige Öffnungen so viel
      // WebGL-Speicher an, dass der Kontext stirbt.
      scene.dispose();
      sceneRef.current = undefined;
    };
    // `items` absichtlich nicht in den Abhängigkeiten: ein Firestore-Update
    // während der Ansicht würde sonst die ganze Szene neu bauen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt, canvas]);

  const onExaggeration = useCallback((_: Event, value: number | number[]) => {
    const factor = Array.isArray(value) ? value[0] : value;
    setExaggeration(factor);
    sceneRef.current?.setExaggeration(factor);
  }, []);

  const onContours = useCallback((_: unknown, checked: boolean) => {
    setShowContours(checked);
    sceneRef.current?.setContoursVisible(checked);
  }, []);

  return (
    <Dialog fullScreen open={open} onClose={onClose}>
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas
          ref={setCanvas}
          data-testid="gelaende3d-canvas"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        <IconButton
          aria-label={t('close')}
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white' }}
        >
          <CloseIcon />
        </IconButton>

        {status === 'loading' && (
          <Box sx={{ position: 'absolute', top: '50%', left: '50%' }}>
            <CircularProgress />
          </Box>
        )}

        {(status === 'empty' || status === 'failed' || status === 'noWebgl') && (
          <Alert
            severity="info"
            sx={{ position: 'absolute', top: 64, left: 16, right: 16 }}
            action={
              status === 'failed' ? (
                <Button onClick={() => setAttempt((n) => n + 1)}>
                  {t('retry')}
                </Button>
              ) : undefined
            }
          >
            {status === 'empty' && t('noTerrain')}
            {status === 'failed' && t('failed')}
            {status === 'noWebgl' && t('noWebgl')}
          </Alert>
        )}

        {status === 'ready' && mesh && (
          <Paper
            sx={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              p: 2,
              minWidth: 260,
              opacity: 0.92,
            }}
          >
            <Typography variant="subtitle2">
              {t('exaggerationValue', {
                factor: exaggeration.toLocaleString('de-AT'),
              })}
            </Typography>
            <Slider
              size="small"
              value={exaggeration}
              min={EXAGGERATION_MIN}
              max={EXAGGERATION_MAX}
              step={EXAGGERATION_STEP}
              onChange={onExaggeration}
              aria-label={t('exaggeration')}
            />
            {/*
              Stufe und Rasterweite gehören zur Anschrift: ohne sie sieht ein
              Ausschnitt aus der Übersichtsstufe genauso genau aus wie einer aus
              der Detailstufe.
            */}
            <Typography variant="body2" component="div">
              {t('span', {
                min: Math.round(mesh.minM),
                max: Math.round(mesh.maxM),
              })}
              {' · '}
              {mesh.level === 'detail' ? t('levelDetail') : t('levelOverview')}
              {' · '}
              {t('resolution', { resolution: mesh.resolutionM })}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showContours}
                  onChange={onContours}
                />
              }
              label={t('contours')}
            />
            <Typography variant="caption" component="div">
              {t('attribution')}
            </Typography>
          </Paper>
        )}

        {status === 'ready' && (
          <Box
            aria-label={t('north')}
            sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              color: 'common.white',
              transform: `rotate(${-azimuth}deg)`,
            }}
          >
            <NavigationIcon />
          </Box>
        )}
      </Box>
    </Dialog>
  );
}
