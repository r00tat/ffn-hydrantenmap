import L from 'leaflet';
import React, { useCallback, useEffect, useState } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { fcItemClasses, getItemInstance } from '../FirecallItems/elements';
import {
  Connection,
  FirecallItem,
  NON_DISPLAYABLE_ITEMS,
} from '../firebase/firestore';
import { useLeitungen } from './Leitungen/context';
import { useDrawing } from './Drawing/DrawingContext';
import useMapEditor from '../../hooks/useMapEditor';
import { usePositionContext } from '../providers/PositionProvider';
import {
  merkeFrischAngelegt,
  wasserstandBasis,
} from './Wasserstand/wasserstandAnlegen';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function AddFirecallItem() {
  const map = useMap();
  const [userPosition, gotPosition, , enableTracking] = usePositionContext();
  const leitungen = useLeitungen();
  const drawingCtx = useDrawing();
  const addFirecallItem = useFirecallItemAdd();
  const [fzgDrawing, setFzgDrawing] = useState<FirecallItem>();
  const {
    setEditFirecallItemIsOpen,
    editFirecallItemIsOpen,
    editFirecallItem,
    lastSelectedLayer,
    setLastSelectedLayer,
  } = useMapEditor();

  const getDefaultPosition = useCallback((): L.LatLng => {
    if (gotPosition && map.getBounds().contains([userPosition.lat, userPosition.lng])) {
      return L.latLng(userPosition.lat, userPosition.lng);
    }
    return map.getCenter();
  }, [map, gotPosition, userPosition]);

  const saveItem = useCallback(
    async (item?: FirecallItem) => {
      if (!item) return;
      const position = getDefaultPosition();
      const angelegt: FirecallItem = {
        datum: new Date().toISOString(),
        lat: position.lat,
        lng: position.lng,
        ...item,
      };

      // Eine Wasserausbreitung braucht die Geländehöhe an ihrem Punkt, sonst
      // steht im Rechner „keine Geländehöhe vor" auf einen Punkt, der gerade
      // gesetzt wurde. Hier ist die Stelle: erst hier steht die endgültige
      // Position fest — bei Maus der Klick, bei Touch die Kartenmitte.
      if (angelegt.type === 'wasserstand') {
        const basis =
          angelegt.lat !== undefined && angelegt.lng !== undefined
            ? await wasserstandBasis([angelegt.lat, angelegt.lng])
            : undefined;
        const created = await addFirecallItem({ ...angelegt, ...(basis ?? {}) });
        // Damit sich der Rechner von selbst öffnet und gleich rechnet, statt
        // erst über Marker-Klick und Symbol im Popup erreichbar zu sein.
        if (created?.id) merkeFrischAngelegt(created.id);
        return;
      }

      await addFirecallItem(angelegt);
    },
    [addFirecallItem, getDefaultPosition]
  );

  useMapEvent('mousemove', (e) => {
    if (fzgDrawing) {
      // console.info(`moving marker to ${e.latlng.lat}, ${e.latlng.lng}`);
      setFzgDrawing({
        ...fzgDrawing,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    }
  });

  useEffect(() => {
    if (editFirecallItemIsOpen) {
      enableTracking();
    }
  }, [editFirecallItemIsOpen, enableTracking]);

  // Disable pointer-events on existing markers while placing a new item
  // so clicks pass through to the map
  useEffect(() => {
    const markerPane = map.getPane('markerPane');
    if (!markerPane || !fzgDrawing) return;
    markerPane.style.pointerEvents = 'none';
    return () => {
      markerPane.style.pointerEvents = '';
    };
  }, [map, fzgDrawing]);

  useMapEvent('click', (e) => {
    if (fzgDrawing) {
      console.info(`dropping marker to ${e.latlng.lat}, ${e.latlng.lng}`);

      const fzgUpdated = {
        ...fzgDrawing,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };
      void saveItem(fzgUpdated);
      setFzgDrawing(undefined);
    }
  });

  const handleMultipleVehicles = useCallback(
    (items: FirecallItem[]) => {
      setEditFirecallItemIsOpen(false);
      if (items.length > 0) {
        setLastSelectedLayer(items[0].layer || '');
      }
      const pos = getDefaultPosition();
      for (const fzg of items) {
        addFirecallItem({
          datum: new Date().toISOString(),
          lat: pos.lat,
          lng: pos.lng,
          ...fzg,
        });
      }
    },
    [addFirecallItem, getDefaultPosition, setEditFirecallItemIsOpen, setLastSelectedLayer],
  );

  const fzgDialogClose = useCallback(
    (fzg?: FirecallItem) => {
      setEditFirecallItemIsOpen(false);
      if (fzg) {
        setLastSelectedLayer(fzg.layer || '');
      }
      if (fcItemClasses[fzg?.type || '']?.isPolyline()) {
        leitungen.setIsDrawing(true);
        leitungen.setFirecallItem(fzg as Connection);
      } else if (fzg?.type === 'drawing') {
        drawingCtx.startDrawing({
          name: fzg.name || 'Zeichnung',
          layer: fzg.layer,
        });
      } else {
        if (fzg) {
          console.info(`firecall dialog close for ${fzg.type} ${fzg.name}`);
          if (
            NON_DISPLAYABLE_ITEMS.includes(fzg.type) ||
            // on a touch device it is better to drop the marker and move it afterwards
            navigator.maxTouchPoints > 0
          ) {
            void saveItem({
              ...fzg,
              lat: getDefaultPosition().lat,
              lng: getDefaultPosition().lng,
            });
          } else {
            console.info(
              `waiting for mouse click to set new object ${fzg.type} ${fzg.name}`
            );
            setFzgDrawing({
              ...fzg,
              lat: getDefaultPosition().lat,
              lng: getDefaultPosition().lng,
            });
          }
        }
        // saveItem(fzg);
      }
    },
    [leitungen, drawingCtx, saveItem, getDefaultPosition, setEditFirecallItemIsOpen, setLastSelectedLayer]
  );

  return (
    <>
      {editFirecallItemIsOpen && (
        <FirecallItemDialog
          onClose={fzgDialogClose}
          onCloseMultiple={handleMultipleVehicles}
          type={editFirecallItem?.type || 'marker'}
          item={
            editFirecallItem?.id
              ? editFirecallItem
              : editFirecallItem
                ? { ...editFirecallItem, layer: editFirecallItem.layer ?? lastSelectedLayer }
                : lastSelectedLayer
                  ? { layer: lastSelectedLayer } as FirecallItem
                  : undefined
          }
        />
      )}
      {fzgDrawing && (
        <React.Fragment>
          {getItemInstance(fzgDrawing).renderMarker(() => {}, {
            hidePopup: true,
            disableClick: true,
          })}
        </React.Fragment>
      )}
    </>
  );
}
