'use client';
import { useCallback, useEffect, useState } from 'react';
import { LayerGroup } from 'react-leaflet';
import { fetchUnwetterData, UnwetterData } from './UnwetterAction';
import FirecallElement from '../../FirecallItems/elements/FirecallElement';
import { FcMarker } from '../../firebase/firestore';
import useFirecall from '../../../hooks/useFirecall';

function useUnwetterSheetData() {
  const [unwetterData, setUnwetterData] = useState<UnwetterData[]>([]);
  const firecall = useFirecall();

  const refreshData = useCallback(async () => {
    const unwetterData = await fetchUnwetterData(
      firecall.sheetId,
      firecall.range
    );
    console.info(`unwetter data`, unwetterData);
    setUnwetterData(unwetterData);
  }, [firecall]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 120000);
    return () => {
      clearInterval(interval);
    };
  }, [refreshData]);

  return unwetterData;
}

const statusColors: { [key: string]: string } = {
  erledigt: 'green',
  'in arbeit': 'blue',
  offen: 'yellow',
  'einsatz notwendig': 'red',
};

export default function UnwetterLayer() {
  const unwetterData = useUnwetterSheetData();

  return (
    <LayerGroup>
      {unwetterData.map((item) => (
        <FirecallElement
          item={
            {
              ...item,
              type: 'marker',
              color: statusColors[item.status?.toLowerCase() || ''] ?? 'red',
              beschreibung: item.description,
              draggable: false,
            } as FcMarker
          }
          selectItem={() => {}}
          key={item.id}
        />
      ))}
    </LayerGroup>
  );
}
