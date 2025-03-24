'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import SaveIcon from '@mui/icons-material/Save';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import React, { useCallback, useState } from 'react';
import { useMapEvent } from 'react-leaflet';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useMapEditor from '../../hooks/useMapEditor';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { fcItemClasses, getItemInstance } from '../FirecallItems/elements';
import {
  Connection,
  FirecallItem,
  NON_DISPLAYABLE_ITEMS,
} from '../firebase/firestore';
import { useLeitungen } from './Leitungen/context';
import RecordButton from './RecordButton';
import SearchButton from './SearchButton';
import InputDialog from '../dialogs/InputDialog';
import { formatTimestamp } from '../../common/time-format';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const [fzgDialogIsOpen, setFzgDialogIsOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const leitungen = useLeitungen();
  const addFirecallItem = useFirecallItemAdd();
  const [fzgDrawing, setFzgDrawing] = useState<FirecallItem>();
  const {
    editable,
    setEditable,
    saveHistory,
    saveInProgress,
    historyId,
    selectHistory,
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
      setFzgDialogIsOpen(false);
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
    [leitungen, map, saveItem]
  );

  return (
    <>
      <Box
        sx={{
          // '& > :not(style)': { m: 1 },
          position: 'absolute',
          bottom: 24,
          right: 16,
        }}
      >
        {editable && (
          <Tooltip title="Neues Element hinzufügen">
            <Fab
              color="primary"
              aria-label="add"
              size="medium"
              onClick={(event) => {
                event.preventDefault();
                setFzgDialogIsOpen(true);
              }}
            >
              <AddIcon />
            </Fab>
          </Tooltip>
        )}
        {editable && (
          <>
            <Tooltip
              title={
                saveInProgress
                  ? 'wird gesichert...'
                  : 'Akutellen Einsatzstatus sichern'
              }
            >
              <Fab
                aria-label="save"
                size="medium"
                style={{ marginLeft: 8 }}
                onClick={() => !saveInProgress && setIsSaveDialogOpen(true)}
                // disabled={saveInProgress}
                color={saveInProgress ? 'default' : 'primary'}
              >
                {!saveInProgress && <SaveIcon />}
                {saveInProgress && <CircularProgress />}
              </Fab>
            </Tooltip>
          </>
        )}

        {historyId === undefined && (
          <Tooltip
            title={
              editable ? 'Bearbeiten deaktiveren' : 'Einsatzkarte bearbeiten'
            }
          >
            <Fab
              color={editable ? 'default' : 'primary'}
              aria-label="edit"
              size="medium"
              style={{ marginLeft: 8 }}
              onClick={(event) => {
                event.preventDefault();
                setEditable((prev) => !prev);
              }}
            >
              {!editable && <EditIcon />}
              {editable && <VisibilityIcon />}
            </Fab>
          </Tooltip>
        )}

        {historyId && (
          <Tooltip title="Historie geladen, kein Bearbeiten möglich">
            <Fab
              color="error"
              aria-label="edit"
              size="medium"
              style={{ marginLeft: 8 }}
              onClick={() => selectHistory()}
            >
              <HistoryIcon />
            </Fab>
          </Tooltip>
        )}
      </Box>
      {editable && (
        <>
          <RecordButton />
          <SearchButton />
        </>
      )}
      {fzgDialogIsOpen && (
        <FirecallItemDialog onClose={fzgDialogClose} type="marker" />
      )}
      {fzgDrawing && (
        <React.Fragment>
          {getItemInstance(fzgDrawing).renderMarker(() => {}, {
            hidePopup: true,
          })}
        </React.Fragment>
      )}
      {isSaveDialogOpen && (
        <InputDialog
          title="Sicherung des Einsatzes ablegen"
          defaultValue={`Einsatzstatus ${formatTimestamp()}`}
          onClose={(result) => {
            setIsSaveDialogOpen(false);
            if (result) {
              saveHistory(result);
            }
          }}
        />
      )}
    </>
  );
}
