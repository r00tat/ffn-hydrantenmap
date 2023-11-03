import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { GridColDef } from '@mui/x-data-grid';
import moment from 'moment';
import { useEffect, useState } from 'react';
import { dateTimeFormat, parseTimestamp } from '../../common/time-format';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import FirecallItemCard from '../FirecallItems/FirecallItemCard';
import {
  Diary,
  FirecallItem,
  Fzg,
  filterActiveItems,
} from '../firebase/firestore';

export function useDiaries() {
  const firecallId = useFirecallId();

  const [diaries, setDiaries] = useState<Diary[]>([]);

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    pathSegments: [firecallId, 'item'],
    // queryConstraints: [where('type', '==', 'vehicle')],
    queryConstraints: [],
    filterFn: filterActiveItems,
  });

  useEffect(() => {
    const cars: Fzg[] = firecallItems.filter(
      (item: FirecallItem) => item.type === 'vehicle'
    ) as Fzg[];
    const firecallEntries: Diary[] = [
      cars
        .filter((item) => item.alarmierung)
        .map(
          (item) =>
            ({
              id: 'alarmierung' + item.id,
              datum: item.alarmierung,
              type: 'diary',
              name: `${item.name} ${item.fw || ''} alarmiert`,
              beschreibung: `${item.besatzung ? '1:' + item.besatzung : ''} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
              original: item,
            } as Diary)
        ),
      cars
        .filter((item) => item.eintreffen)
        .map(
          (item) =>
            ({
              id: 'eintreffen' + item.id,
              datum: item.eintreffen,
              type: 'diary',
              name: `${item.name} ${item.fw || ''} eingetroffen`,
              beschreibung: `${item.besatzung ? '1:' + item.besatzung : ''} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
              original: item,
            } as Diary)
        ),
      cars
        .filter((item) => item.abruecken)
        .map(
          (item) =>
            ({
              id: 'abruecken' + item.id,
              datum: item.abruecken,
              type: 'diary',
              name: `${item.name} ${item.fw || ''} abgerückt`,
              beschreibung: `${item.besatzung ? '1:' + item.besatzung : ''} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
              original: item,
            } as Diary)
        ),
      firecallItems
        .filter(
          (item: FirecallItem) =>
            ['vehicle', 'diary'].indexOf(item.type) < 0 && item.datum
        )
        .map(
          (item: FirecallItem) =>
            ({
              ...item,
              type: 'diary',
              editable: true,
              original: item,
            } as Diary)
        ),
      firecallItems
        .filter((item: FirecallItem) => item.type === 'diary')
        .map(
          (item: FirecallItem) =>
            ({ ...item, original: item, editable: true } as Diary)
        ),
    ].flat();
    const diaries = firecallEntries
      .map((a) => {
        const m = parseTimestamp(a.datum);
        if (m) {
          a.datum = m.format();
        } else {
          a.datum = new Date().toISOString();
        }
        return a;
      })
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .map((a) => ({
        ...a,
        datum: moment(a.datum).format(dateTimeFormat),
      }));
    setDiaries(diaries);
  }, [firecallItems]);
  return diaries;
}

function useGridColumns() {
  const [columns, setColumns] = useState<GridColDef[]>();
  useEffect(() => {
    setColumns([
      { field: 'name', headerName: 'Name', minWidth: 150, flex: 0.3 },
      { field: 'datum', headerName: 'Datum', flex: 0.3 },
      { field: 'beschreibung', headerName: 'Beschreibung', flex: 0.4 },
    ]);
  }, []);
  return columns;
}

export interface EinsatzTagebuchOptions {
  boxHeight?: string;
}
export default function EinsatzTagebuchPrint({
  boxHeight = '600px',
}: EinsatzTagebuchOptions) {
  const firecallId = useFirecallId();
  const diaries = useDiaries();
  const columns = useGridColumns();

  return (
    <>
      {false && (
        <Box sx={{ p: 2, m: 2 }}>
          <Typography variant="h3" gutterBottom>
            Einsatz Tagebuch
          </Typography>
          <Grid container spacing={2}>
            {diaries.map((item) => (
              <FirecallItemCard
                item={item}
                key={item.id}
                firecallId={firecallId}
              />
            ))}
          </Grid>
        </Box>
      )}

      {columns && (
        <Box sx={{ p: 2, m: 2, height: boxHeight }}>
          <Typography variant="h3" gutterBottom>
            Einsatz Tagebuch
          </Typography>
          {/* <DataGrid
            rows={diaries}
            columns={columns}
            getRowId={(row) => row.id}
            initialState={{
              pagination: {
                paginationModel: {
                  pageSize: 500,
                },
              },
            }}
            pageSizeOptions={[100, 500, 1000, 10000]}
          /> */}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Datum</th>
                <th>Beschreibung</th>
              </tr>
            </thead>
            <tbody>
              {diaries.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.datum}</td>
                  <td>{item.beschreibung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </>
  );
}
