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

  // Extract specific values to avoid re-fetching when unrelated firecall properties change
  const firecallId = firecall.id;
  const sheetId = firecall.sheetId;
  const range = firecall.range;

  const refreshData = useCallback(async () => {
    if (firecallId && firecallId !== 'unknown') {
      const data = await fetchUnwetterData(sheetId, range);
      console.info(`unwetter data`, data);
      setUnwetterData(data);
    }
  }, [firecallId, sheetId, range]);

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
  'kein einsatz': 'green',
  'in arbeit': 'orange',
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
