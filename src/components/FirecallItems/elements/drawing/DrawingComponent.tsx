import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import { LeafletMouseEvent } from 'leaflet';
import React, { useCallback } from 'react';
import { Polyline, Popup } from 'react-leaflet';
import { FirecallItem } from '../../../firebase/firestore';
import { useDrawingStrokes } from '../../../../hooks/useDrawingStrokes';
import useMapEditor from '../../../../hooks/useMapEditor';
import { useMapEditable } from '../../../../hooks/useMapEditor';
import { PopupNavigateButton } from '../FirecallItemBase';

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
  const editable = useMapEditable();

  const handleEdit = useCallback(() => {
    selectFirecallItem(item);
  }, [selectFirecallItem, item]);

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
          <Popup>
            <PopupNavigateButton lat={item.lat} lng={item.lng} />
            {editable && (
              <IconButton
                sx={{ marginLeft: 'auto', float: 'right' }}
                onClick={handleEdit}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
              >
                <EditIcon />
              </IconButton>
            )}
            {item.name || 'Zeichnung'}
          </Popup>
        </Polyline>
      ))}
    </>
  );
}
