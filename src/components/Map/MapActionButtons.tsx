import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import RoomIcon from '@mui/icons-material/Room';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { addDoc, collection } from 'firebase/firestore';
import L from 'leaflet';
import React, { useCallback, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall from '../../hooks/useFirecall';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import { firestore } from '../firebase/firebase';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { firecallItemInfo } from '../FirecallItems/firecallitems';
import { Firecall, FirecallItem } from '../firebase/firestore';
import RohrIcon from '../FirecallItems/RohrIcon';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const { email } = useFirebaseLogin();
  const [fzgDialogIsOpen, setFzgDialogIsOpen] = useState(false);
  const [einsatzDialog, setEinsatzDialog] = useState(false);
  const [rohrDialogIsOpen, setRohrDialogIsOpen] = useState(false);
  const firecall = useFirecall();
  const [markerDialogIsOpen, setMarkerDialogIsOpen] = useState(false);
  const [tagebuchDialogIsOpen, setTagebuchDialogIsOpen] = useState(false);

  const saveItem = useCallback(
    (item?: FirecallItem) => {
      if (item) {
        addDoc(
          collection(firestore, 'call', firecall?.id || 'unkown', 'item'),
          {
            ...firecallItemInfo(item.type).factory(),
            ...item,
            lat: map.getCenter().lat,
            lng: map.getCenter().lng,
            user: email,
            created: new Date(),
          }
        );
      }
    },
    [email, firecall?.id, map]
  );

  const fzgDialogClose = useCallback(
    (fzg?: FirecallItem) => {
      setFzgDialogIsOpen(false);
      saveItem(fzg);
    },
    [saveItem]
  );

  const einsatzDialogClose = useCallback((einsatz?: Firecall) => {
    setEinsatzDialog(false);
  }, []);

  const rohrDialogClose = useCallback(
    (rohr?: FirecallItem) => {
      setRohrDialogIsOpen(false);
      saveItem(rohr);
    },
    [saveItem]
  );

  const markerDialogClose = useCallback(
    (item?: FirecallItem) => {
      setMarkerDialogIsOpen(false);
      saveItem(item);
    },
    [saveItem]
  );
  const diaryClose = useCallback(
    (item?: FirecallItem) => {
      setTagebuchDialogIsOpen(false);
      if (item) {
        addDoc(
          collection(firestore, 'call', firecall?.id || 'unkown', 'diary'),
          {
            ...item,
            user: email,
            created: new Date(),
          }
        );
      }
    },
    [email, firecall?.id]
  );

  return (
    <>
      <SpeedDial
        ariaLabel="Kartenaktionen"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        icon={<SpeedDialIcon />}
      >
        <SpeedDialAction
          icon={<DirectionsCarIcon />}
          tooltipTitle="Fahrzeug"
          onClick={() => setFzgDialogIsOpen(true)}
        />
        <SpeedDialAction
          icon={<RohrIcon />}
          tooltipTitle="Rohr"
          onClick={() => setRohrDialogIsOpen(true)}
        />
        <SpeedDialAction
          icon={<RoomIcon />}
          tooltipTitle="Marker"
          onClick={() => setMarkerDialogIsOpen(true)}
        />

        <SpeedDialAction
          icon={<LibraryBooksIcon />}
          tooltipTitle="Einsatztagebuch"
          onClick={() => setTagebuchDialogIsOpen(true)}
        />

        <SpeedDialAction
          icon={<LocalFireDepartmentIcon />}
          tooltipTitle="Einsatz"
          onClick={() => setEinsatzDialog(true)}
        />
      </SpeedDial>

      {markerDialogIsOpen && (
        <FirecallItemDialog type="marker" onClose={markerDialogClose} />
      )}
      {tagebuchDialogIsOpen && (
        <FirecallItemDialog
          type="diary"
          onClose={diaryClose}
          allowTypeChange={false}
        />
      )}
      {einsatzDialog && (
        <EinsatzDialog
          onClose={einsatzDialogClose}
          position={map.getCenter()}
        />
      )}
      {fzgDialogIsOpen && (
        <FirecallItemDialog onClose={fzgDialogClose} type="vehicle" />
      )}
      {rohrDialogIsOpen && (
        <FirecallItemDialog onClose={rohrDialogClose} type="rohr" />
      )}
    </>
  );
}
