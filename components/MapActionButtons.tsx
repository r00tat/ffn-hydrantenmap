import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { addDoc, collection } from 'firebase/firestore';
import L from 'leaflet';
import React, { useCallback, useState } from 'react';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import useLastFirecall from '../hooks/useFirecall';
import EinsatzDialog from './EinsatzDialog';
import { firestore } from './firebase';
import { Firecall, Fzg } from './firestore';
import FzgDialog from './FzgDialog';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const { email } = useFirebaseLogin();
  const [fzgDialogIsOpen, setFzgDialogIsOpen] = useState(false);
  const [einsatzDialog, setEinsatzDialog] = useState(false);
  const firecall = useLastFirecall();

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
        });
      }
    },
    [email]
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
          icon={<LocalFireDepartmentIcon />}
          tooltipTitle="Einsatz"
          onClick={() => setEinsatzDialog(true)}
        />
      </SpeedDial>
      {fzgDialogIsOpen && <FzgDialog onClose={fzgDialogClose} />}

      {einsatzDialog && <EinsatzDialog onClose={einsatzDialogClose} />}
    </>
  );
}
