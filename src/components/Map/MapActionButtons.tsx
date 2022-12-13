import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import { addDoc, collection } from 'firebase/firestore';
import L from 'leaflet';
import { useCallback, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import { firestore } from '../firebase/firebase';
import { Connection, FirecallItem } from '../firebase/firestore';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { firecallItemInfo } from '../FirecallItems/infos/firecallitems';
import { useLeitungen } from './Leitungen/context';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const { email } = useFirebaseLogin();
  const [fzgDialogIsOpen, setFzgDialogIsOpen] = useState(false);
  const firecallId = useFirecallId();
  const leitungen = useLeitungen();

  const saveItem = useCallback(
    (item?: FirecallItem) => {
      if (item) {
        addDoc(collection(firestore, 'call', firecallId, 'item'), {
          ...firecallItemInfo(item.type).factory(),
          ...item,
          lat: map.getCenter().lat,
          lng: map.getCenter().lng,
          user: email,
          created: new Date(),
        });
      }
    },
    [email, firecallId, map]
  );

  const fzgDialogClose = useCallback(
    (fzg?: FirecallItem) => {
      setFzgDialogIsOpen(false);
      if (fzg?.type === 'connection') {
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
          bottom: 16,
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

      {fzgDialogIsOpen && (
        <FirecallItemDialog onClose={fzgDialogClose} type="vehicle" />
      )}
    </>
  );
}
