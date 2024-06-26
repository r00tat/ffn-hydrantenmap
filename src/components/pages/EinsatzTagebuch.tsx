'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import moment from 'moment';
import { useCallback, useEffect, useState } from 'react';
import {
  dateTimeFormat,
  formatTimestamp,
  parseTimestamp,
} from '../../common/time-format';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import DeleteFirecallItemDialog from '../FirecallItems/DeleteFirecallItemDialog';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import { downloadRowsAsCsv } from '../firebase/download';
import {
  Diary,
  FirecallItem,
  Fzg,
  filterActiveItems,
} from '../firebase/firestore';
import { DownloadButton } from '../inputs/DownloadButton';

export function useDiaries() {
  const firecallId = useFirecallId();

  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [diaryCounter, setDiaryCounter] = useState(1);

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
      // firecallItems
      //   .filter(
      //     (item: FirecallItem) =>
      //       ['vehicle', 'diary'].indexOf(item.type) < 0 && item.datum
      //   )
      //   .map(
      //     (item: FirecallItem) =>
      //       ({
      //         ...item,
      //         type: 'diary',
      //         editable: true,
      //         original: item,
      //       } as Diary)
      //   ),
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
      .sort(
        (a, b) =>
          (a.nummer ?? 0) - (b.nummer ?? 0) ?? a.datum.localeCompare(b.datum)
      )
      .map((a) => ({
        ...a,
        datum: moment(a.datum).format(dateTimeFormat),
        erledigt: a.erledigt
          ? moment(a.erledigt).format(dateTimeFormat)
          : undefined,
      }));
    setDiaries(diaries);
    setDiaryCounter(
      firecallEntries.filter((f) => f.type === 'diary' && f.nummer).length + 1
    );
  }, [firecallItems]);
  return { diaries, diaryCounter };
}

async function downloadDiaries(diaries: Diary[]) {
  const rows: any[][] = [
    [
      'Nummer',
      'Datum',
      'Von',
      'An',
      'Art',
      'Information',
      'Anmerkung',
      'erledigt',
    ],
    ...diaries.map((d) => [
      d.nummer,
      formatTimestamp(d.datum),
      d.von,
      d.an,
      d.art,
      d.name,
      d.beschreibung,
      d.erledigt ? formatTimestamp(d.erledigt) : '',
    ]),
  ];
  downloadRowsAsCsv(rows, 'Einsatztagebuch.csv');
}

export function DiaryButtons({ diary }: { diary: Diary }) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  return (
    <>
      {diary.editable && (
        <>
          <Tooltip title={`${diary.name} bearbeiten`}>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setDisplayUpdateDialog(true);
              }}
            >
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={`${diary.name} löschen`}>
            <IconButton
              color="warning"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteDialog(true);
              }}
            >
              <DeleteIcon />
            </IconButton>
          </Tooltip>
          {displayUpdateDialog && (
            <FirecallItemUpdateDialog
              allowTypeChange={false}
              item={diary}
              callback={() => {
                setDisplayUpdateDialog(false);
              }}
            />
          )}

          {deleteDialog && (
            <DeleteFirecallItemDialog
              item={diary.original || diary}
              callback={() => {
                setDeleteDialog(false);
              }}
            />
          )}
        </>
      )}
    </>
  );
}

export function useGridColumns() {
  const [columns, setColumns] = useState<GridColDef[]>();
  useEffect(() => {
    setColumns([
      { field: 'nummer', headerName: 'Nummer', minWidth: 40, flex: 0.05 },
      { field: 'datum', headerName: 'Datum', flex: 0.15, minWidth: 50 },
      { field: 'von', headerName: 'Von', minWidth: 50, flex: 0.1 },
      { field: 'an', headerName: 'An', minWidth: 50, flex: 0.1 },
      { field: 'art', headerName: 'Art', minWidth: 50, flex: 0.1 },
      { field: 'name', headerName: 'Information', minWidth: 100, flex: 0.2 },
      { field: 'beschreibung', headerName: 'Anmerkung', flex: 0.2 },
      { field: 'erledigt', headerName: 'Erledigt', flex: 0.15 },
      {
        field: 'buttons',
        headerName: 'Aktionen',
        flex: 0.1,
        renderCell: (params) => <DiaryButtons diary={params.row as Diary} />,
      },
    ]);
  }, []);
  return columns;
}

export interface EinsatzTagebuchOptions {
  boxHeight?: string;
}
export default function EinsatzTagebuch({
  boxHeight = '1000px',
}: EinsatzTagebuchOptions) {
  const [tagebuchDialogIsOpen, setTagebuchDialogIsOpen] = useState(false);
  const { diaries, diaryCounter } = useDiaries();
  const columns = useGridColumns();
  const addEinsatzTagebuch = useFirecallItemAdd();

  const diaryClose = useCallback(
    (item?: FirecallItem) => {
      setTagebuchDialogIsOpen(false);
      if (item) {
        addEinsatzTagebuch(item);
      }
    },
    [addEinsatzTagebuch]
  );

  return (
    <>
      {columns && (
        <Box sx={{ p: 2, m: 2, height: boxHeight }}>
          <Typography variant="h3" gutterBottom>
            Einsatz Tagebuch{' '}
            <DownloadButton
              onClick={() => downloadDiaries(diaries)}
              tooltip="Einsatz Tagebuch als CSV herunterladen"
            />
          </Typography>
          <DataGrid
            rows={diaries}
            columns={columns}
            getRowId={(row) => row.id}
            autoHeight
          />
        </Box>
      )}

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setTagebuchDialogIsOpen(true)}
      >
        <AddIcon />
      </Fab>

      {tagebuchDialogIsOpen && (
        <FirecallItemDialog
          type="diary"
          item={{ type: 'diary', nummer: diaryCounter } as Diary}
          onClose={diaryClose}
          allowTypeChange={false}
        />
      )}
    </>
  );
}
