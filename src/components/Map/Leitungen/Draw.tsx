import L, { LatLng } from 'leaflet';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleMarker, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import type { LatLngPosition } from '../../../common/geo';
import { hoseLabel } from '../../../common/waterSupply';
import { calculateDistance } from '../../FirecallItems/elements/connection/distance';
import HoseLengthOverlay from '../../FirecallItems/elements/connection/HoseLengthOverlay';
import { leafletIcons } from '../../FirecallItems/icons';
import { useLeitungen } from './context';

const DRAWING_PANE = 'drawingPane';
const DRAWING_PANE_Z = 650;

const LeitungenDraw = () => {
  const map = useMap();
  const [positions, setPositions] = useState<LatLng[]>([]);
  const [complete, setComplete] = useState(false);
  /**
   * Der Mauszeiger, für die Vorschau auf den nächsten Klick.
   *
   * Auf Touch-Geräten gibt es kein `mousemove`; dort bleibt der Wert leer und
   * es bleibt von selbst bei der laufenden Summe — kein Sonderfall im Code.
   */
  const [cursor, setCursor] = useState<LatLng>();
  const leitungen = useLeitungen();

  // Create a custom pane for drawing markers
  useEffect(() => {
    if (!map.getPane(DRAWING_PANE)) {
      const pane = map.createPane(DRAWING_PANE);
      pane.style.zIndex = String(DRAWING_PANE_Z);
    }
  }, [map]);

  // Use refs so the capture handler always sees current state
  const positionsRef = useRef(positions);
  useLayoutEffect(() => { positionsRef.current = positions; });
  const completeRef = useRef(complete);
  useLayoutEffect(() => { completeRef.current = complete; });

  // During drawing mode, capture clicks on the map container in the
  // capture phase (before Leaflet's event delegation). This ensures
  // clicks on existing markers/vectors are intercepted and turned into
  // drawing points instead of being consumed by those layers.
  // Clicks on drawing point markers (in the drawingPane) are let through.
  useEffect(() => {
    if (!leitungen.isDrawing) return;

    const container = map.getContainer();
    container.style.cursor = 'crosshair';

    const handleClick = (e: MouseEvent) => {
      // Let clicks on drawing point markers through (they're in the drawingPane)
      const drawingPane = map.getPane(DRAWING_PANE);
      if (drawingPane && drawingPane.contains(e.target as Node)) {
        return;
      }

      // Stop the event from reaching Leaflet's _handleDOMEvent
      e.stopPropagation();

      // Convert pixel position to latlng
      const rect = container.getBoundingClientRect();
      const containerPoint = new L.Point(
        e.clientX - rect.left,
        e.clientY - rect.top
      );
      const latlng = map.containerPointToLatLng(containerPoint);
      console.info(`drawing click at ${latlng}`);

      if (completeRef.current) {
        setPositions([latlng]);
        setComplete(false);
      } else {
        setPositions([...positionsRef.current, latlng]);
      }
    };

    container.addEventListener('click', handleClick, true);
    return () => {
      container.removeEventListener('click', handleClick, true);
      container.style.cursor = '';
    };
  }, [map, leitungen.isDrawing]);

  // Die Vorschau hängt am Zeiger und darf nicht weiterlaufen, wenn das
  // Zeichnen endet — sonst zeigte sie auf eine Linie, die es nicht mehr gibt.
  useEffect(() => {
    if (!leitungen.isDrawing) return;
    const onMove = (event: L.LeafletMouseEvent) => setCursor(event.latlng);
    map.on('mousemove', onMove);
    return () => {
      map.off('mousemove', onMove);
      // Im Aufräumen und nicht im Effektkörper: Das Abmelden **ist** der
      // Anlass, den Zeiger zu vergessen, und ein `setState` im Körper löste
      // eine Folgekaskade aus.
      setCursor(undefined);
    };
  }, [map, leitungen.isDrawing]);

  const item = leitungen.firecallItem;
  const isConnection = item?.type === 'connection';
  const dimension = (item as { dimension?: string } | undefined)?.dimension || 'B';
  const hoseLengthM =
    (item as { oneHozeLength?: number } | undefined)?.oneHozeLength || 20;

  const drawn: LatLngPosition[] = positions.map((p) => [p.lat, p.lng]);
  // Die Vorschau hängt am letzten gesetzten Punkt; ohne einen gibt es nichts
  // aufzuspannen.
  const preview: [LatLngPosition, LatLngPosition] | undefined =
    cursor && drawn.length > 0 && !complete
      ? [drawn[drawn.length - 1], [cursor.lat, cursor.lng]]
      : undefined;
  const previewDistance = preview
    ? calculateDistance([...drawn, preview[1]])
    : 0;

  return (
    <>
      {positions.map((p, index) => (
        <Marker
          key={p.toString()}
          position={p}
          title={`p ${p}`}
          icon={leafletIcons().circle}
          draggable
          autoPan={false}
          pane={DRAWING_PANE}
          eventHandlers={{
            click: (event) => {
              console.info(`click on ${p} ${index}`);
              if (index == positions.length - 1) {
                setComplete(true);
                leitungen.setIsDrawing(false);
                void leitungen.complete([...positions]);
                setPositions([]);
              }
            },
            dragend: (event) => {
              const positionCopy = [...positions];
              positionCopy.splice(
                index,
                1,
                (event.target as L.Marker)?.getLatLng()
              );
              setPositions(positionCopy);
            },
          }}
        >
          {/* <Popup>{connectionInfo.popupFn(record)}</Popup> */}
        </Marker>
      ))}
      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: complete ? '#0000ff' : '#00ff00' }}
        ></Polyline>
      )}

      {/* Laufende Summe und Schlaucheinteilung des bisher Gezeichneten. Die
          Schlauchzahl nur bei der Leitung: Dieselbe Zeichenmaschine bedient
          Linien und Flächen, und „12 Schläuche" an einer Dammlinie wäre
          Unsinn. */}
      {drawn.length > 1 && (
        <HoseLengthOverlay
          positions={drawn}
          dimension={isConnection ? dimension : undefined}
          hoseLengthM={hoseLengthM}
          color={complete ? '#0000ff' : '#00ff00'}
          pane={DRAWING_PANE}
        />
      )}

      {/* Vorschau auf den nächsten Klick: Erst damit ist vor dem Setzen zu
          sehen, ob eine Schlauchlänge noch reicht. */}
      {preview && (
        <>
          <Polyline
            positions={preview}
            pathOptions={{
              color: '#00ff00',
              dashArray: '8 8',
              interactive: false,
            }}
            pane={DRAWING_PANE}
          />
          <CircleMarker
            center={preview[1]}
            radius={1}
            pane={DRAWING_PANE}
            pathOptions={{ opacity: 0, fillOpacity: 0, interactive: false }}
          >
            <Tooltip permanent direction="right" offset={[8, 0]}>
              {hoseLabel(
                previewDistance,
                isConnection ? dimension : undefined,
                hoseLengthM
              )}
            </Tooltip>
          </CircleMarker>
        </>
      )}
    </>
  );
};

export default LeitungenDraw;
