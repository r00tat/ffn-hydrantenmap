import L, { LatLng } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Marker, Polyline, useMap } from 'react-leaflet';
import { leafletIcons } from '../../FirecallItems/icons';
import { useLeitungen } from './context';

const DRAWING_PANE = 'drawingPane';
const DRAWING_PANE_Z = 650;

const LeitungenDraw = () => {
  const map = useMap();
  const [positions, setPositions] = useState<LatLng[]>([]);
  const [complete, setComplete] = useState(false);
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
  positionsRef.current = positions;
  const completeRef = useRef(complete);
  completeRef.current = complete;

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
                leitungen.complete([...positions]);
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
    </>
  );
};

export default LeitungenDraw;
