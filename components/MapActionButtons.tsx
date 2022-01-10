import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { addDoc, collection } from 'firebase/firestore';
import L from 'leaflet';
import React, { useCallback, useState } from 'react';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import useFirecall from '../hooks/useFirecall';
import EinsatzDialog from './EinsatzDialog';
import { firestore } from './firebase';
import { Firecall, FirecallItem, Fzg, Rohr } from './firestore';
import FzgDialog from './FzgDialog';
import RohrIcon from './RohrIcon';
import RohrDialog from './RohrDialog';
import RoomIcon from '@mui/icons-material/Room';
import FirecallItemDialog from './FirecallItemDialog';

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

  const fzgDialogClose = useCallback(
    (fzg?: Fzg) => {
      setFzgDialogIsOpen(false);
      if (fzg) {
        addDoc(
          collection(firestore, 'call', firecall?.id || 'unkown', 'item'),
          {
            ...fzg,
            lat: map.getCenter().lat,
            lng: map.getCenter().lng,
            type: 'vehicle',
            user: email,
            created: new Date(),
          }
        );
      }
    },
    [email, firecall?.id, map]
  );

  const einsatzDialogClose = useCallback(
    (einsatz?: Firecall) => {
      if (einsatz) {
        addDoc(collection(firestore, 'call'), {
          ...einsatz,
          user: email,
          created: new Date(),
          lat: map.getCenter().lat,
          lng: map.getCenter().lng,
        });
      }
    },
    [email, map]
  );

  const rohrDialogClose = useCallback(
    (rohr?: Rohr) => {
      setRohrDialogIsOpen(false);
      if (rohr) {
        addDoc(
          collection(firestore, 'call', firecall?.id || 'unkown', 'item'),
          {
            ...rohr,
            lat: map.getCenter().lat,
            lng: map.getCenter().lng,
            type: 'rohr',
            user: email,
            created: new Date(),
          }
        );
      }
    },
    [email, firecall?.id, map]
  );

  const markerDialogClose = useCallback(
    (item?: FirecallItem) => {
      if (item) {
        addDoc(
          collection(firestore, 'call', firecall?.id || 'unkown', 'item'),
          {
            ...item,
            user: email,
            created: new Date(),
            lat: map.getCenter().lat,
            lng: map.getCenter().lng,
          }
        );
      }
    },
    [email, firecall?.id, map]
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
          icon={<LocalFireDepartmentIcon />}
          tooltipTitle="Einsatz"
          onClick={() => setEinsatzDialog(true)}
        />
      </SpeedDial>

      {markerDialogIsOpen && (
        <FirecallItemDialog
          item={{ type: 'marker' }}
          onClose={markerDialogClose}
        />
      )}
      {einsatzDialog && <EinsatzDialog onClose={einsatzDialogClose} />}
      {fzgDialogIsOpen && <FzgDialog onClose={fzgDialogClose} />}
      {rohrDialogIsOpen && <RohrDialog onClose={rohrDialogClose} />}
    </>
  );
}
