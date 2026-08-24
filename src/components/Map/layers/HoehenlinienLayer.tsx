'use client';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayerGroup, Marker, Polyline, useMap } from 'react-leaflet';
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
  contourColor,
  contourLabelText,
  contourWeight,
  EQUIDISTANCE_STORAGE_KEY,
  HOEHENLINIEN_LAYER_NAME,
  isIndexContour,
  labelAnchors,
  readEquidistanceChoice,
  resolveEquidistance,
  thinLabels,
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
 *
 * Die Farbe einer Linie kommt aus ihrer Höhe **im sichtbaren Ausschnitt**
 * (siehe `contourColor`). Damit trägt sie nur zusammen mit zwei Angaben eine
 * Aussage, und beide gehören deshalb fest zur Darstellung: die Legende, die
 * die Enden der Rampe in Metern beschriftet, und die Höhe an der Linie selbst.
 */

/** Rand um den Ausschnitt, damit ein kleines Verschieben nicht neu rechnet. */
const BOUNDS_PADDING = 0.15;

/**
 * Setzung der Beschriftungen, alles in Bildschirmpixeln.
 *
 * `SPACING` ist der Abstand zweier Beschriftungen auf derselben Linie,
 * `MIN_LENGTH` die Länge, ab der eine Linie überhaupt eine bekommt, und `CELL`
 * das Raster, in dem einander überdeckende Beschriftungen ausgedünnt werden.
 */
const LABEL_SPACING_PX = 420;
const LABEL_MIN_LENGTH_PX = 140;
const LABEL_CELL_PX = 96;

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'failed';

interface ContourLabel {
  heightM: number;
  position: L.LatLng;
  angleDeg: number;
  x: number;
  y: number;
}

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
  const map = useMap();
  const visible = useLayerVisible();
  const { zoom, bounds } = useViewport();

  const [choice, setChoice] = useState<EquidistanceChoice>(
    readEquidistanceChoice
  );
  const equidistanceM = resolveEquidistance(choice, zoom);

  const [lines, setLines] = useState<ContourLine[]>([]);
  const [level, setLevel] = useState<TerrainLevelId | undefined>();
  const [resolutionM, setResolutionM] = useState<number | undefined>();
  const [span, setSpan] = useState<{ minM?: number; maxM?: number }>({});
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
        setSpan({ minM: result.minM, maxM: result.maxM });
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

  const dark = theme.palette.mode === 'dark';

  /**
   * Die Spanne, auf die die Farbrampe gedehnt wird.
   *
   * Bis eine Antwort da ist, hilft die Spanne der Linien selbst — sonst
   * bekämen alle Linien für einen Moment dieselbe Farbe.
   */
  const { minM, maxM } = useMemo(() => {
    if (span.minM !== undefined && span.maxM !== undefined) {
      return { minM: span.minM, maxM: span.maxM };
    }
    const heights = lines.map((line) => line.heightM);
    return heights.length > 0
      ? { minM: Math.min(...heights), maxM: Math.max(...heights) }
      : { minM: 0, maxM: 1 };
  }, [span, lines]);

  const shown = status === 'ready' && visible;

  /**
   * Die Höhe an der Linie.
   *
   * Nur an Zähllinien, und nur so dicht, wie sie einander nicht überdecken.
   * Ohne diese Angabe bleibt die Farbe eine Ordnung ohne Werte: man sieht, was
   * höher liegt, aber nicht, wie hoch.
   */
  const labels = useMemo<ContourLabel[]>(() => {
    if (!shown) return [];

    const candidates: ContourLabel[] = [];
    // Lange Linien zuerst: beim Ausdünnen gewinnt die erste je Rasterzelle,
    // und ein durchgehender Höhenzug ist die nützlichere Beschriftung als ein
    // kurzer Ring daneben.
    const ordered = [...lines]
      .filter((line) => isIndexContour(line.heightM, equidistanceM))
      .sort((a, b) => b.points.length - a.points.length);

    for (const line of ordered) {
      const screen = line.points.map((point) =>
        map.latLngToContainerPoint(point)
      );
      for (const anchor of labelAnchors(
        screen,
        LABEL_SPACING_PX,
        LABEL_MIN_LENGTH_PX
      )) {
        candidates.push({
          ...anchor,
          heightM: line.heightM,
          position: map.containerPointToLatLng([anchor.x, anchor.y]),
        });
      }
    }

    return thinLabels(candidates, LABEL_CELL_PX);
  }, [shown, lines, equidistanceM, map]);

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
        {(shown ? lines : []).map((line, index) => (
          <Polyline
            key={`${line.heightM}-${index}`}
            positions={line.points}
            pathOptions={{
              renderer,
              color: contourColor(line.heightM, minM, maxM, dark),
              weight: contourWeight(line.heightM, equidistanceM),
              opacity: 0.9,
              // Höhenlinien sind Linien, keine Flächen — ein gefüllter
              // geschlossener Ring würde die Karte darunter verdecken.
              fill: false,
            }}
          />
        ))}

        {labels.map((label) => (
          <Marker
            key={`${label.heightM}-${Math.round(label.x)}-${Math.round(
              label.y
            )}`}
            position={label.position}
            // Die Beschriftung liegt über der Karte, darf aber nichts
            // wegfangen: ein Klick gilt dem, was darunter liegt.
            interactive={false}
            keyboard={false}
            icon={L.divIcon({
              className: '',
              iconSize: [0, 0],
              html: `<span style="
                position:absolute;
                transform:translate(-50%,-50%) rotate(${label.angleDeg.toFixed(
                  1
                )}deg);
                white-space:nowrap;
                font: 600 11px/1 ${theme.typography.fontFamily};
                color:${contourColor(label.heightM, minM, maxM, dark)};
                text-shadow:
                  -1.5px 0 ${theme.palette.background.paper},
                  1.5px 0 ${theme.palette.background.paper},
                  0 -1.5px ${theme.palette.background.paper},
                  0 1.5px ${theme.palette.background.paper};
              ">${contourLabelText(label.heightM)}</span>`,
            })}
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
            minM={span.minM}
            maxM={span.maxM}
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
