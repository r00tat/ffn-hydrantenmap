import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import React, { useCallback, useState } from 'react';
import useLastFirecall from '../hooks/useFirecall';
import { firestore } from './firebase';
import { Fzg } from './firestore';
import FzgDialog from './FzgDialog';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const [fzgDialogIsOpen, setFzgDialogIsOpen] = useState(false);
  const firecall = useLastFirecall();
  const addEinsatz = useCallback(async () => {
    await addDoc(collection(firestore, 'call'), {
      name: 'Testeinsatz',
      date: new Date(),
    });
  }, []);

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
          }
        );
      }
    },
    [firecall?.id, map]
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
          onClick={addEinsatz}
        />
      </SpeedDial>
      {fzgDialogIsOpen && <FzgDialog onClose={fzgDialogClose} />}
    </>
  );
}
