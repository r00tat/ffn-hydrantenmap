'use client';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayerGroup, Polyline, useMap } from 'react-leaflet';
import { useTranslations } from 'next-intl';
import { terrainClient } from '../../../common/terrain/terrainClient';
import type { TerrainLevelId } from '../../../common/terrain/terrainIndexTypes';
import type {
  ContourLine,
  TerrainBoundsLatLng,
} from '../../../common/terrain/terrainTypes';
import HoehenlinienControl from '../HoehenlinienControl';
import HoehenlinienLegende from '../HoehenlinienLegende';
import {
  contourWeight,
  EQUIDISTANCE_STORAGE_KEY,
  HOEHENLINIEN_LAYER_NAME,
  readEquidistanceChoice,
  resolveEquidistance,
  type EquidistanceChoice,
} from './hoehenlinien';

/**
 * Höhenlinien aus dem eigenen Höhenmodell.
 *
 * Lazy wie die übrigen Overlays: ohne eingeschalteten Layer wird keine Kachel
 * geladen. Das ist hier keine Feinheit — ein Bildschirm Detailstufe sind
 * mehrere Megabyte, und eine gewöhnliche Karte soll sie nicht kosten.
 *
 * Gezeichnet wird über einen gemeinsamen `L.canvas()`-Renderer. Bei 0,5 m
 * Äquidistanz sind es hunderte Linien; als einzelne SVG-Pfade würde das DOM
 * überlaufen und das Verschieben der Karte ruckeln.
 */

/** Rand um den Ausschnitt, damit ein kleines Verschieben nicht neu rechnet. */
const BOUNDS_PADDING = 0.15;

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'failed';

function useLayerVisible(): boolean {
  const map = useMap();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.name === HOEHENLINIEN_LAYER_NAME) setVisible(true);
    };
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.name === HOEHENLINIEN_LAYER_NAME) setVisible(false);
    };
    map.on('overlayadd', onAdd as L.LeafletEventHandlerFn);
    map.on('overlayremove', onRemove as L.LeafletEventHandlerFn);
    return () => {
      map.off('overlayadd', onAdd as L.LeafletEventHandlerFn);
      map.off('overlayremove', onRemove as L.LeafletEventHandlerFn);
    };
  }, [map]);

  return visible;
}

function useViewport(): { zoom: number; bounds: TerrainBoundsLatLng } {
  const map = useMap();

  const read = useCallback(() => {
    const bounds = map.getBounds().pad(BOUNDS_PADDING);
    return {
      zoom: map.getZoom(),
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      },
    };
  }, [map]);

  const [viewport, setViewport] = useState(read);

  useEffect(() => {
    const update = () => setViewport(read());
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
    };
  }, [map, read]);

  return viewport;
}

export default function HoehenlinienLayer() {
  const t = useTranslations('hoehenlinien');
  const theme = useTheme();
  const visible = useLayerVisible();
  const { zoom, bounds } = useViewport();

  const [choice, setChoice] = useState<EquidistanceChoice>(
    readEquidistanceChoice
  );
  const equidistanceM = resolveEquidistance(choice, zoom);

  const [lines, setLines] = useState<ContourLine[]>([]);
  const [level, setLevel] = useState<TerrainLevelId | undefined>();
  const [resolutionM, setResolutionM] = useState<number | undefined>();
  const [status, setStatus] = useState<Status>('idle');

  /**
   * Nummer der laufenden Anfrage. Beim Verschieben der Karte überholen sich
   * die Antworten sonst, und die Karte zeigt die Linien eines Ausschnitts, der
   * nicht mehr zu sehen ist.
   */
  const runningRef = useRef(0);

  useEffect(() => {
    if (!visible) return;

    const run = runningRef.current + 1;
    runningRef.current = run;

    void (async () => {
      setStatus('loading');
      try {
        const result = await terrainClient().contours(bounds, equidistanceM);
        if (runningRef.current !== run) return;
        setLines(result.lines);
        setLevel(result.level);
        setResolutionM(result.resolutionM);
        setStatus(result.lines.length > 0 ? 'ready' : 'empty');
      } catch (err) {
        console.error('Höhenlinien konnten nicht berechnet werden', err);
        if (runningRef.current !== run) return;
        setLines([]);
        setStatus('failed');
      }
    })();
  }, [visible, bounds, equidistanceM]);

  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);

  const color = useMemo(
    () =>
      theme.palette.mode === 'dark'
        ? theme.palette.warning.light
        : theme.palette.warning.dark,
    [theme]
  );

  const chooseEquidistance = useCallback((next: EquidistanceChoice) => {
    setChoice(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, next);
    }
  }, []);

  return (
    <>
      {/* Gezeichnet wird nur ein fertiges Ergebnis. Beim Verschieben oder
      Wiedereinschalten stünden sonst für einen Moment die Linien des alten
      Ausschnitts an der falschen Stelle. */}
      <LayerGroup attribution={t('attribution')}>
        {(status === 'ready' && visible ? lines : []).map((line, index) => (
          <Polyline
            key={`${line.heightM}-${index}`}
            positions={line.points}
            pathOptions={{
              renderer,
              color,
              weight: contourWeight(line.heightM),
              opacity: 0.9,
              // Höhenlinien sind Linien, keine Flächen — ein gefüllter
              // geschlossener Ring würde die Karte darunter verdecken.
              fill: false,
            }}
          />
        ))}
      </LayerGroup>

      {visible && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 30,
            right: 10,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            alignItems: 'flex-end',
            pointerEvents: 'auto',
          }}
        >
          <HoehenlinienLegende
            equidistanceM={equidistanceM}
            level={level}
            resolutionM={resolutionM}
            lineCount={lines.length}
            status={status === 'idle' ? 'loading' : status}
          />
          <Box
            sx={{
              bgcolor: 'background.paper',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              boxShadow: 2,
            }}
          >
            <HoehenlinienControl
              choice={choice}
              effectiveM={equidistanceM}
              onChange={chooseEquidistance}
            />
          </Box>
        </Box>
      )}
    </>
  );
}
