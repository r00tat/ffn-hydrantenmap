'use client';

import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { useFirecallId } from '../../../hooks/useFirecall';
import useMapEditor from '../../../hooks/useMapEditor';
import { useDrawing } from '../Drawing/DrawingContext';
import {
  useBoxSelectMode,
  useMapSelectionStore,
  useSelectionCount,
  useSelectionState,
} from './MapSelectionContext';
import {
  boundsFromCorners,
  LatLngDelta,
  previewedCenter,
  selectItemsInBounds,
} from './multiSelect';
import type { SelectionStore } from './selectionStore';
import useMoveSelection from './useMoveSelection';

/** Ab dieser Zeigerbewegung (px) wird aus dem Druck ein Rahmen. */
const BOX_START_THRESHOLD_PX = 5;

const MOVE_HANDLE_SOURCE = 'handle';

const EMPTY_IDS: Set<string> = new Set();

const BOX_STYLE: L.PolylineOptions = {
  color: '#1976d2',
  weight: 2,
  dashArray: '6 4',
  fillOpacity: 0.1,
  interactive: false,
};

/** Pfeilkreuz (Material „open_with") als Griff zum Verschieben. */
const MOVE_HANDLE_ICON_HTML =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
  '<path fill="currentColor" d="M10 9h4V6h3l-5-5-5 5h3zm-1 1H6V7l-5 5 5 5v-3h3zm14 2-5-5v3h-3v4h3v3zm-9 3h-4v3H7l5 5 5-5h-3z"/>' +
  '</svg>';

/**
 * Rahmen ziehen auf der Karte.
 *
 * Am Desktop mit gedrückter Umschalttaste, auf Touch-Geräten im Auswahlmodus
 * (Schalter im Panel), weil es dort keine Umschalttaste gibt. Leaflets eigenes
 * Umschalt-Ziehen (Box-Zoom) ist im Bearbeitungsmodus abgeschaltet.
 */
function useBoxSelect(
  map: L.Map,
  store: SelectionStore,
  active: boolean,
  boxMode: boolean
) {
  // Box-Zoom und Rahmenauswahl teilen sich die Geste.
  useEffect(() => {
    if (!active) return;
    map.boxZoom.disable();
    return () => {
      map.boxZoom.enable();
    };
  }, [map, active]);

  // Im Auswahlmodus verschiebt ein Zug nicht die Karte.
  useEffect(() => {
    if (!active || !boxMode) return;
    const container = map.getContainer();
    map.dragging.disable();
    container.style.cursor = 'crosshair';
    return () => {
      map.dragging.enable();
      container.style.cursor = '';
    };
  }, [map, active, boxMode]);

  useEffect(() => {
    if (!active) return;
    const container = map.getContainer();
    const mapPane = map.getPane('mapPane');
    let suppressClick = false;
    let gesture:
      | {
          pointerId: number;
          start: L.Point;
          rect?: L.Rectangle;
          shiftOnly: boolean;
        }
      | undefined;

    const containerPoint = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      return L.point(e.clientX - r.left, e.clientY - r.top);
    };

    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (gesture?.shiftOnly) map.dragging.enable();
      if (gesture?.rect) {
        gesture.rect.remove();
        L.DomUtil.enableTextSelection();
      }
      gesture = undefined;
    };

    const onMove = (e: PointerEvent) => {
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      const point = containerPoint(e);
      if (!gesture.rect) {
        if (point.distanceTo(gesture.start) < BOX_START_THRESHOLD_PX) return;
        L.DomUtil.disableTextSelection();
        gesture.rect = L.rectangle(
          L.latLngBounds(
            map.containerPointToLatLng(gesture.start),
            map.containerPointToLatLng(point)
          ),
          BOX_STYLE
        ).addTo(map);
        return;
      }
      gesture.rect.setBounds(
        L.latLngBounds(
          map.containerPointToLatLng(gesture.start),
          map.containerPointToLatLng(point)
        )
      );
    };

    const onUp = (e: PointerEvent) => {
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      if (gesture.rect) {
        const a = map.containerPointToLatLng(gesture.start);
        const b = map.containerPointToLatLng(containerPoint(e));
        store.setSelection(
          selectItemsInBounds(store.visibleItems(), boundsFromCorners(a, b))
        );
        // Der Klick, den der Browser nach dem Loslassen auslöst, soll die
        // Auswahl weder leeren noch ein Element darunter umschalten.
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
      finish();
    };

    const onCancel = () => finish();

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Ein zweiter Finger heißt Zoomen, nicht Rahmen.
      if (gesture) {
        finish();
        return;
      }
      const boxModeOn = store.getState().boxMode;
      const shift = e.shiftKey && e.pointerType === 'mouse';
      if (!boxModeOn && !shift) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const onMap = target === container || mapPane?.contains(target);
      if (!onMap || target.closest('.leaflet-marker-icon, .leaflet-popup')) {
        return;
      }
      const shiftOnly = !boxModeOn;
      if (shiftOnly) map.dragging.disable();
      gesture = { pointerId: e.pointerId, start: containerPoint(e), shiftOnly };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    // Klick ins Leere hebt die Auswahl auf, Umschalt-Klick nicht (der könnte
    // ein Element knapp verfehlt haben).
    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.shiftKey) return;
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.('.leaflet-interactive')) return;
      store.clear();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.clear();
    };

    container.addEventListener('pointerdown', onPointerDown, true);
    container.addEventListener('click', onClickCapture, true);
    map.on('click', onMapClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      finish();
      container.removeEventListener('pointerdown', onPointerDown, true);
      container.removeEventListener('click', onClickCapture, true);
      map.off('click', onMapClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [map, store, active]);
}

function SelectionPanel({ store }: { store: SelectionStore }) {
  const t = useTranslations('mapSelection');
  const count = useSelectionCount();
  const boxMode = useBoxSelectMode();
  const ref = useRef<HTMLDivElement>(null);

  // Klicks und Scrollen im Panel gehen nicht an die Karte.
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);

  return (
    <Paper
      ref={ref}
      data-multiselect-panel
      elevation={3}
      sx={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 0.25,
        borderRadius: 4,
        maxWidth: 'calc(100% - 140px)',
      }}
    >
      <Tooltip title={boxMode ? t('boxModeOff') : t('boxModeOn')}>
        <IconButton
          size="small"
          aria-label={t('boxMode')}
          aria-pressed={boxMode}
          color={boxMode ? 'primary' : 'default'}
          onClick={() => store.setBoxMode(!boxMode)}
        >
          <HighlightAltIcon />
        </IconButton>
      </Tooltip>
      {count > 0 && (
        <Tooltip title={t('clear')}>
          <Chip
            size="small"
            color="primary"
            label={t('selectedCount', { count })}
            onDelete={() => store.clear()}
            sx={{ minWidth: 0 }}
          />
        </Tooltip>
      )}
    </Paper>
  );
}

function SelectionMoveHandle({ store }: { store: SelectionStore }) {
  const t = useTranslations('mapSelection');
  const { previewMove, moveSelection, cancelPreview } = useMoveSelection();
  // Neu rechnen, wenn sich Auswahl, Elementdaten oder Vorschau ändern.
  const selectedIds = useSelectionState((s) => s.selectedIds, EMPTY_IDS);
  const itemsVersion = useSelectionState((s) => s.itemsVersion, 0);
  const preview = useSelectionState((s) => s.preview, undefined);
  const center = useMemo(
    () =>
      selectedIds.size > 0
        ? previewedCenter(store.movableItems(), preview)
        : undefined,
    // `itemsVersion` steht für neue Elementdaten im Store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, selectedIds, itemsVersion, preview]
  );
  /**
   * Während des Zuges bewegt Leaflet den Griff selbst. Die Lage aus dem Store
   * liefe wegen der Vorschau mit — ein `setLatLng` von React mitten im Zug
   * ließe ihn springen. Deshalb bleibt die Lage vom Zugbeginn stehen.
   */
  const [frozen, setFrozen] = useState<L.LatLng>();
  const originRef = useRef<L.LatLng>(undefined);
  const frameRef = useRef<number>(undefined);
  const icon = useMemo(
    () =>
      L.divIcon({
        html: MOVE_HANDLE_ICON_HTML,
        className: 'multiselect-move-handle',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    []
  );

  if (!center && !frozen) return null;
  const position = frozen ?? L.latLng(center!.lat, center!.lng);

  const deltaFrom = (marker: L.Marker): LatLngDelta | undefined => {
    const origin = originRef.current;
    if (!origin) return undefined;
    const moved = marker.getLatLng();
    return { lat: moved.lat - origin.lat, lng: moved.lng - origin.lng };
  };

  return (
    <Marker
      position={position}
      icon={icon}
      draggable
      autoPan={false}
      zIndexOffset={2000}
      title={t('moveHandle')}
      eventHandlers={{
        dragstart: (event) => {
          const latLng = (event.target as L.Marker).getLatLng();
          originRef.current = latLng;
          setFrozen(latLng);
        },
        drag: (event) => {
          const delta = deltaFrom(event.target as L.Marker);
          if (!delta) return;
          if (frameRef.current !== undefined) {
            cancelAnimationFrame(frameRef.current);
          }
          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = undefined;
            previewMove(delta, MOVE_HANDLE_SOURCE);
          });
        },
        dragend: (event) => {
          if (frameRef.current !== undefined) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = undefined;
          }
          const delta = deltaFrom(event.target as L.Marker);
          originRef.current = undefined;
          setFrozen(undefined);
          if (delta) {
            void moveSelection(delta, MOVE_HANDLE_SOURCE);
          } else {
            cancelPreview();
          }
        },
      }}
    />
  );
}

/**
 * Mehrfachauswahl auf der Karte: Rahmen ziehen, Panel mit Anzahl und
 * Auswahlmodus, Griff zum Verschieben. Nur im Bearbeitungsmodus (im
 * Verlaufsmodus ist `editable` immer `false`) und nicht beim Zeichnen.
 * Siehe docs/karte-mehrfachauswahl.md.
 */
export default function MapMultiSelect() {
  const map = useMap();
  const store = useMapSelectionStore();
  const { editable } = useMapEditor();
  const drawing = useDrawing();
  const firecallId = useFirecallId();
  const boxMode = useBoxSelectMode();
  const count = useSelectionCount();
  const active = editable && !drawing.isDrawing && !!store;

  // Ohne Bearbeitungsmodus oder in einem anderen Einsatz gibt es keine Auswahl.
  useEffect(() => {
    if (!store) return;
    if (!editable) {
      store.clear();
      store.setBoxMode(false);
    }
  }, [store, editable]);
  useEffect(() => {
    store?.clear();
  }, [store, firecallId]);

  useBoxSelect(map, store ?? NULL_STORE, active, boxMode);

  if (!active || !store) return null;
  return (
    <>
      <SelectionPanel store={store} />
      {count > 0 && <SelectionMoveHandle store={store} />}
    </>
  );
}

/** Platzhalter, damit der Hook ohne Provider bedingungslos laufen kann. */
const NULL_STORE: SelectionStore = {
  getState: () => ({ selectedIds: new Set(), boxMode: false, itemsVersion: 0 }),
  subscribe: () => () => {},
  setSelection: () => {},
  toggle: () => {},
  clear: () => {},
  setBoxMode: () => {},
  setPreview: () => {},
  register: () => () => {},
  visibleItems: () => [],
  selectedItems: () => [],
  movableItems: () => [],
};
