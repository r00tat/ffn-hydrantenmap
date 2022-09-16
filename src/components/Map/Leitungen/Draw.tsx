import { LatLng, LeafletMouseEvent, LeafletMouseEventHandlerFn } from 'leaflet';
import { useCallback, useState } from 'react';
import { Marker, Polyline, useMap, useMapEvent } from 'react-leaflet';
import { connectionIcon } from '../../FirecallItems/icons';
import { useLeitungen } from './context';

// const itemInfo = firecallItemInfo('marker');

const LeitungenDraw = () => {
  const map = useMap();
  const [positions, setPositions] = useState<LatLng[]>([]);
  const [complete, setComplete] = useState(false);
  const leitungen = useLeitungen();

  const handler: LeafletMouseEventHandlerFn = useCallback(
    (event: LeafletMouseEvent) => {
      console.info(`clicked on ${event.latlng}`);
      if (leitungen.isDrawing) {
        if (complete) {
          setPositions([event.latlng]);
          setComplete(false);
        } else {
          setPositions([...positions, event.latlng]);
        }
      }
    },
    [complete, leitungen, positions]
  );
  useMapEvent('click', handler);
  return (
    <>
      {positions.map((p, index) => (
        <Marker
          key={p.toString()}
          position={p}
          title={`p ${p}`}
          icon={connectionIcon}
          draggable
          autoPan={false}
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
