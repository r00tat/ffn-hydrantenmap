'use client';
import { useCallback, useEffect, useState } from 'react';
import { LayerGroup } from 'react-leaflet';
import { fetchUnwetterData, UnwetterData } from './UnwetterAction';
import FirecallElement from '../../FirecallItems/elements/FirecallElement';
import { FcMarker } from '../../firebase/firestore';
import useFirecall from '../../../hooks/useFirecall';

function useUnwetterSheetData(sheetId?: string, range?: string) {
  const [unwetterData, setUnwetterData] = useState<UnwetterData[]>([]);

  const refreshData = useCallback(async () => {
    const unwetterData = await fetchUnwetterData(sheetId, range);
    setUnwetterData(unwetterData);
  }, [sheetId, range]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 120000);
    return () => {
      clearInterval(interval);
    };
  }, [refreshData]);

  return unwetterData;
}

export default function UnwetterLayer() {
  const firecall = useFirecall();
  const unwetterData = useUnwetterSheetData(
    firecall?.sheetId,
    firecall?.sheetRange
  );

  useEffect(() => {
    console.log('UnwetterLayer', unwetterData);
  }, [unwetterData]);
  return (
    <LayerGroup>
      {unwetterData.map((item) => (
        <FirecallElement
          item={
            {
              ...item,
              type: 'marker',
              color: 'red',
              beschreibung: item.description,
            } as FcMarker
          }
          selectItem={() => {}}
          key={item.id}
        />
      ))}
    </LayerGroup>
  );
}
