import React from 'react';
import { Polyline } from 'react-leaflet';
import { FirecallItem } from '../../../firebase/firestore';
import { useDrawingStrokes } from '../../../../hooks/useDrawingStrokes';

interface DrawingComponentProps {
  item: FirecallItem;
  pane?: string;
}

export default function DrawingComponent({
  item,
  pane,
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
        />
      ))}
    </>
  );
}
