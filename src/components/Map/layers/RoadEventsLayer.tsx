'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import L from 'leaflet';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
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
import useOnline from '../../../hooks/useOnline';
import { recordError } from '../../firebase/crashlytics';
import { fetchRoadEvents } from './RoadEventsAction';

export const ROAD_EVENTS_LAYER_NAME = 'Verkehrsmeldungen';

/** Nach dieser Zeit wird auch ohne Verschieben neu geladen. */
const REFRESH_MS = 5 * 60 * 1000;
/** Geladen wird je Seite eine Ausschnittsbreite mehr. */
const PADDING_FACTOR = 1;

export const ROAD_EVENT_COLORS: Record<RoadEventKind, string> = {
  closure: '#d32f2f',
  restriction: '#ef6c00',
  incident: '#b08800',
};

type Status = 'idle' | 'ready' | 'notConfigured' | 'failed';

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

function EventPopup({ event }: { event: RoadEventWithPath }) {
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
    <Popup>
      <Box sx={{ maxWidth: 300 }}>
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
          {t('source')}
        </Typography>
      </Box>
    </Popup>
  );
}

export default function RoadEventsLayer() {
  const t = useTranslations('roadEvents');
  const visible = useLayerVisible();
  const online = useOnline();
  const { events, status, failedFeeds } = useRoadEvents(visible, online);

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
      <LayerGroup attribution={t('attribution')}>
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
              >
                <EventPopup event={event} />
              </CircleMarker>
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
            >
              <EventPopup event={event} />
            </Polyline>
          );
        })}
      </LayerGroup>
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
