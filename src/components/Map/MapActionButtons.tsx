import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import L from 'leaflet';
import { useCallback, useState } from 'react';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { fcItemClasses } from '../FirecallItems/elements';
import { Connection, FirecallItem } from '../firebase/firestore';
import { useLeitungen } from './Leitungen/context';
import RecordButton from './RecordButton';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const [fzgDialogIsOpen, setFzgDialogIsOpen] = useState(false);
  const leitungen = useLeitungen();
  const addFirecallItem = useFirecallItemAdd();

  const saveItem = useCallback(
    (item?: FirecallItem) => {
      if (item) {
        addFirecallItem({
          datum: new Date().toISOString(),
          ...item,
          lat: map.getCenter().lat,
          lng: map.getCenter().lng,
        });
      }
    },
    [addFirecallItem, map]
  );

  const fzgDialogClose = useCallback(
    (fzg?: FirecallItem) => {
      setFzgDialogIsOpen(false);
      if (fcItemClasses[fzg?.type || '']?.isPolyline()) {
        leitungen.setIsDrawing(true);
        leitungen.setFirecallItem(fzg as Connection);
      } else {
        saveItem(fzg);
      }
    },
    [leitungen, saveItem]
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
      </Box>

      <RecordButton />

      {fzgDialogIsOpen && (
        <FirecallItemDialog onClose={fzgDialogClose} type="vehicle" />
      )}
    </>
  );
}
