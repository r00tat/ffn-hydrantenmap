'use client';

import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import L from 'leaflet';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  CircleMarker,
  LayerGroup,
  Polyline,
  Popup,
  useMap,
} from 'react-leaflet';
import {
  BoundingBox,
  RoadEventKind,
  RoadEventWithPath,
} from '../../../common/roadEvents';
import { boundsContain, padBounds } from '../../../common/roadEventsBounds';
import { eventsAtPoint } from '../../../common/roadEventsHit';
import useOnline from '../../../hooks/useOnline';
import { recordError } from '../../firebase/crashlytics';
import { fetchRoadEvents } from './RoadEventsAction';

export const ROAD_EVENTS_LAYER_NAME = 'Verkehrsmeldungen';

/** Nach dieser Zeit wird auch ohne Verschieben neu geladen. */
const REFRESH_MS = 5 * 60 * 1000;
/** Geladen wird je Seite eine Ausschnittsbreite mehr. */
const PADDING_FACTOR = 1;
/** Trefferfläche um die Linie (halbe Linienbreite plus Spielraum für Finger). */
const HIT_TOLERANCE_PX = 10;

export const ROAD_EVENT_COLORS: Record<RoadEventKind, string> = {
  closure: '#d32f2f',
  restriction: '#ef6c00',
  incident: '#b08800',
};

type Status = 'idle' | 'ready' | 'notConfigured' | 'failed';

interface Selection {
  at: L.LatLngExpression;
  events: RoadEventWithPath[];
}

function useLayerVisible(): boolean {
  const map = useMap();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.name === ROAD_EVENTS_LAYER_NAME) setVisible(true);
    };
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.name === ROAD_EVENTS_LAYER_NAME) setVisible(false);
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

function viewBounds(map: L.Map): BoundingBox {
  const b = map.getBounds();
  return {
    south: b.getSouth(),
    west: b.getWest(),
    north: b.getNorth(),
    east: b.getEast(),
  };
}

function useRoadEvents(visible: boolean, online: boolean) {
  const map = useMap();
  const [events, setEvents] = useState<RoadEventWithPath[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [failedFeeds, setFailedFeeds] = useState<string[]>([]);
  const loadedRef = useRef<{ bounds: BoundingBox; at: number } | undefined>(
    undefined
  );
  const runRef = useRef(0);

  useEffect(() => {
    if (!visible || !online) return;

    const load = async (force: boolean) => {
      const view = viewBounds(map);
      const loaded = loadedRef.current;
      if (
        !force &&
        loaded &&
        boundsContain(loaded.bounds, view) &&
        Date.now() - loaded.at < REFRESH_MS
      ) {
        return;
      }
      const bounds = padBounds(view, PADDING_FACTOR);
      const run = ++runRef.current;
      try {
        const result = await fetchRoadEvents(bounds);
        if (runRef.current !== run) return;
        loadedRef.current = { bounds, at: Date.now() };
        setEvents(result.events);
        setFailedFeeds(result.failedFeeds);
        setStatus(result.configured ? 'ready' : 'notConfigured');
      } catch (err) {
        if (runRef.current !== run) return;
        console.error('Verkehrsmeldungen konnten nicht geladen werden', err);
        void recordError(err, { source: 'road-events-layer' });
        setStatus('failed');
      }
    };

    void load(false);
    const onMove = () => void load(false);
    map.on('moveend', onMove);
    const interval = setInterval(() => void load(true), REFRESH_MS);
    return () => {
      map.off('moveend', onMove);
      clearInterval(interval);
    };
  }, [visible, online, map]);

  return { events, status, failedFeeds };
}

function EventDetails({ event }: { event: RoadEventWithPath }) {
  const t = useTranslations('roadEvents');
  const locale = useLocale();
  const format = (value?: string) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? undefined
      : date.toLocaleString(locale, {
          dateStyle: 'short',
          timeStyle: 'short',
        });
  };
  const start = format(event.start);
  const end = format(event.end);
  const title = [event.road, event.roadName].filter(Boolean).join(' ');

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: ROAD_EVENT_COLORS[event.kind], fontWeight: 700 }}
      >
        {t(`kind.${event.kind}`)}
      </Typography>
      {title && (
        <Typography variant="subtitle2" component="div">
          {title}
        </Typography>
      )}
      {event.direction && (
        <Typography variant="body2" component="div">
          {event.direction}
        </Typography>
      )}
      {event.description && (
        <Typography
          variant="body2"
          component="div"
          sx={{ mt: 0.5, whiteSpace: 'pre-line' }}
        >
          {event.description}
        </Typography>
      )}
      {(start || end) && (
        <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
          {start && end
            ? t('timeRange', { start, end })
            : start
              ? t('since', { start })
              : t('until', { end: end ?? '' })}
        </Typography>
      )}
      {event.url && /^https:\/\//.test(event.url) && (
        <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
          <a href={event.url} target="_blank" rel="noopener noreferrer">
            {t('details')}
          </a>
        </Typography>
      )}
      {event.approximate && (
        <Typography
          variant="caption"
          component="div"
          sx={{ mt: 0.5, color: 'text.secondary' }}
        >
          {t('approximate')}
        </Typography>
      )}
      <Typography
        variant="caption"
        component="div"
        sx={{ mt: 0.5, color: 'text.secondary' }}
      >
        {t(`source.${event.source}`)}
      </Typography>
    </Box>
  );
}

/** Alle Meldungen an der angeklickten Stelle, die schwerste zuerst. */
function EventsPopup({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  return (
    <Popup position={selection.at} eventHandlers={{ remove: onClose }}>
      <Box sx={{ maxWidth: 300, maxHeight: 360, overflowY: 'auto' }}>
        {selection.events.map((event, index) => (
          <Fragment key={event.key}>
            {index > 0 && <Divider sx={{ my: 1 }} />}
            <EventDetails event={event} />
          </Fragment>
        ))}
      </Box>
    </Popup>
  );
}

export default function RoadEventsLayer() {
  const t = useTranslations('roadEvents');
  const visible = useLayerVisible();
  const online = useOnline();
  const { events, status, failedFeeds } = useRoadEvents(visible, online);
  const map = useMap();
  const [selection, setSelection] = useState<Selection>();

  // Sperre und Baustelle liegen oft genau übereinander, die obere Linie
  // verdeckt die untere. Ein Klick zeigt deshalb alle Meldungen an der
  // Stelle, nicht nur die oberste.
  const select = (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    const hits = eventsAtPoint(
      events,
      e.containerPoint,
      (latLng) => map.latLngToContainerPoint(latLng),
      HIT_TOLERANCE_PX
    );
    if (hits.length > 0) setSelection({ at: e.latlng, events: hits });
  };

  // Leichtere Meldungen zuerst, damit Sperren obenauf liegen.
  const ordered = [...events].reverse();

  const notice = !visible
    ? undefined
    : !online
      ? t('offline')
      : status === 'notConfigured'
        ? t('notConfigured')
        : status === 'failed'
          ? t('failed')
          : failedFeeds.length > 0
            ? t('partial')
            : undefined;

  return (
    <>
      {/* Attribution nur, solange die Ebene eingeschaltet ist: react-leaflet
          trägt sie bei jeder Änderung des Props direkt am Kartensteuerelement
          ein, ohne zu prüfen, ob das Overlay auf der Karte liegt.
          t.raw: Der Text ist HTML für Leaflet; t() hielte die <a> für
          Rich-Text-Tags und würfe INVALID_TAG. Er kommt aus dem eigenen
          Katalog, nicht von außen. */}
      <LayerGroup
        attribution={visible ? (t.raw('attribution') as string) : undefined}
      >
        {ordered.map((event) => {
          const color = ROAD_EVENT_COLORS[event.kind];
          if (event.path.length < 2) {
            return (
              <CircleMarker
                key={event.key}
                center={event.path[0] ?? event.from}
                radius={7}
                pathOptions={{
                  color: '#fff',
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 1,
                }}
                eventHandlers={{ click: select }}
              />
            );
          }
          return (
            <Polyline
              key={event.key}
              positions={event.path}
              pathOptions={{
                color,
                weight: 6,
                opacity: 0.85,
                lineCap: 'round',
                dashArray: event.approximate ? '8 8' : undefined,
              }}
              eventHandlers={{ click: select }}
            />
          );
        })}
      </LayerGroup>
      {visible && selection && (
        <EventsPopup
          selection={selection}
          onClose={() => setSelection(undefined)}
        />
      )}
      {notice && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 30,
            left: 10,
            zIndex: 1000,
            bgcolor: 'background.paper',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            boxShadow: 2,
            maxWidth: 280,
          }}
        >
          <Typography variant="caption">{notice}</Typography>
        </Box>
      )}
    </>
  );
}
