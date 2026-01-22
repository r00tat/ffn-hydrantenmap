import L from 'leaflet';
import React, { useCallback, useState } from 'react';
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
import useMapEditor from '../../hooks/useMapEditor';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function AddFirecallItem() {
  const map = useMap();
  const leitungen = useLeitungen();
  const addFirecallItem = useFirecallItemAdd();
  const [fzgDrawing, setFzgDrawing] = useState<FirecallItem>();
  const {
    setEditFirecallItemIsOpen,
    editFirecallItemIsOpen,
    editFirecallItem,
  } = useMapEditor();

  const saveItem = useCallback(
    (item?: FirecallItem) => {
      if (item) {
        const { eventHandlers, ...rest } = item;

        addFirecallItem({
          datum: new Date().toISOString(),
          lat: map.getCenter().lat,
          lng: map.getCenter().lng,
          ...rest,
        });
      }
    },
    [addFirecallItem, map]
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

  useMapEvent('click', (e) => {
    if (fzgDrawing) {
      console.info(`dropping marker to ${e.latlng.lat}, ${e.latlng.lng}`);

      const fzgUpdated = {
        ...fzgDrawing,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };
      saveItem(fzgUpdated);
      setFzgDrawing(undefined);
    }
  });

  const fzgDialogClose = useCallback(
    (fzg?: FirecallItem) => {
      setEditFirecallItemIsOpen(false);
      if (fcItemClasses[fzg?.type || '']?.isPolyline()) {
        leitungen.setIsDrawing(true);
        leitungen.setFirecallItem(fzg as Connection);
      } else {
        if (fzg) {
          console.info(`firecall dialog close for ${fzg.type} ${fzg.name}`);
          if (
            NON_DISPLAYABLE_ITEMS.includes(fzg.type) ||
            // on a touch device it is better to drop the marker and move it afterwards
            navigator.maxTouchPoints > 0
          ) {
            saveItem({
              ...fzg,
              lat: map.getCenter().lat,
              lng: map.getCenter().lng,
            });
          } else {
            console.info(
              `waiting for mouse click to set new object ${fzg.type} ${fzg.name}`
            );
            setFzgDrawing({
              ...fzg,
              lat: map.getCenter().lat,
              lng: map.getCenter().lng,
            });
          }
        }
        // saveItem(fzg);
      }
    },
    [leitungen, map, saveItem, setEditFirecallItemIsOpen]
  );

  return (
    <>
      {editFirecallItemIsOpen && (
        <FirecallItemDialog
          onClose={fzgDialogClose}
          type={editFirecallItem?.type || 'marker'}
          item={editFirecallItem}
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
