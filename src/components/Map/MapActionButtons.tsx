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
import { useMap, useMapEvent } from 'react-leaflet';
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
import AddFirecallItem from './AddFirecallItem';
import AiAssistantButton from './AiAssistantButton';
import { useFirecallItems } from '../firebase/firestoreHooks';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const {
    editable,
    setEditable,
    historyId,
    selectHistory,
    openFirecallItemDialog,
  } = useMapEditor();
  const firecallItems = useFirecallItems();
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
                openFirecallItemDialog();
              }}
            >
              <AddIcon />
            </Fab>
          </Tooltip>
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
      <AddFirecallItem />
      {editable && <AiAssistantButton firecallItems={firecallItems} />}
    </>
  );
}
