import { LeafletMouseEvent } from 'leaflet';
import React from 'react';
import { Polyline } from 'react-leaflet';
import { FirecallItem } from '../../../firebase/firestore';
import { useDrawingStrokes } from '../../../../hooks/useDrawingStrokes';
import { FirecallItemPopup } from '../FirecallItemBase';

interface DrawingComponentProps {
  item: FirecallItem;
  selectItem: (item: FirecallItem) => void;
  pane?: string;
  onContextMenu?: (item: FirecallItem, event: LeafletMouseEvent) => void;
}

export default function DrawingComponent({
  item,
  selectItem,
  pane,
  onContextMenu,
}: DrawingComponentProps): React.ReactNode {
  const strokes = useDrawingStrokes(item.id);

  return (
    <>
      {strokes.map((stroke, idx) => (
        <Polyline
          key={idx}
          positions={stroke.points.map(([lat, lng]) => [lat, lng] as [number, number])}
          pathOptions={{
            color: stroke.color,
            weight: stroke.width,
            lineCap: 'round',
            lineJoin: 'round',
          }}
          pane={pane}
          eventHandlers={{
            ...(onContextMenu
              ? {
                  contextmenu: (e: LeafletMouseEvent) => {
                    e.originalEvent.preventDefault();
                    onContextMenu(item, e);
                  },
                }
              : {}),
          }}
        >
          <FirecallItemPopup
            onClick={() => selectItem(item)}
            lat={item.lat}
            lng={item.lng}
          >
            {item.name || 'Zeichnung'}
          </FirecallItemPopup>
        </Polyline>
      ))}
    </>
  );
}
