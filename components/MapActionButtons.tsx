import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import React, { useCallback } from 'react';
import useLastFirecall from '../hooks/useFirecall';
import { firestore } from './firebase';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const firecall = useLastFirecall();
  const addEinsatz = useCallback(async () => {
    await addDoc(collection(firestore, 'call'), {
      name: 'Testeinsatz',
      date: new Date(),
    });
  }, []);
  const addVehicle = useCallback(async () => {
    await addDoc(
      collection(firestore, 'call', firecall?.id || 'unkown', 'item'),
      {
        name: 'Test Fzg 1',
        date: new Date(),
        lat: map.getCenter().lat,
        lng: map.getCenter().lng,
        type: 'vehicle',
      }
    );
  }, [firecall?.id, map]);

  return (
    <SpeedDial
      ariaLabel="Kartenaktionen"
      sx={{ position: 'absolute', bottom: 16, right: 16 }}
      icon={<SpeedDialIcon />}
    >
      <SpeedDialAction
        icon={<DirectionsCarIcon />}
        tooltipTitle="Fahrzeug"
        onClick={addVehicle}
      />

      <SpeedDialAction
        icon={<LocalFireDepartmentIcon />}
        tooltipTitle="Einsatz"
        onClick={addEinsatz}
      />
    </SpeedDial>
  );
}
