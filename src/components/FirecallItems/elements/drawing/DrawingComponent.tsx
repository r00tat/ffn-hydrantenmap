import { LeafletMouseEvent } from 'leaflet';
import React from 'react';
import { Polyline } from 'react-leaflet';
import { FirecallItem } from '../../../firebase/firestore';
import { useDrawingStrokes } from '../../../../hooks/useDrawingStrokes';
import useMapEditor from '../../../../hooks/useMapEditor';

interface DrawingComponentProps {
  item: FirecallItem;
  pane?: string;
  onContextMenu?: (item: FirecallItem, event: LeafletMouseEvent) => void;
}

export default function DrawingComponent({
  item,
  pane,
  onContextMenu,
}: DrawingComponentProps): React.ReactNode {
  const strokes = useDrawingStrokes(item.id);
  const { selectFirecallItem } = useMapEditor();

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
            click: () => {
              selectFirecallItem(item);
            },
            ...(onContextMenu
              ? {
                  contextmenu: (e: LeafletMouseEvent) => {
                    e.originalEvent.preventDefault();
                    onContextMenu(item, e);
                  },
                }
              : {}),
          }}
        />
      ))}
    </>
  );
}
