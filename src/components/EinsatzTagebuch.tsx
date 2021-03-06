import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { addDoc, collection } from 'firebase/firestore';
import moment from 'moment';
import { useCallback, useEffect, useState } from 'react';
import { dateTimeFormat, parseTimestamp } from '../common/time-format';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { useFirecallId } from '../hooks/useFirecall';
import { firestore } from './firebase/firebase';
import {
  Diary,
  filterActiveItems,
  FirecallItem,
  Fzg,
} from './firebase/firestore';
import DeleteFirecallItemDialog from './FirecallItems/DeleteFirecallItemDialog';
import FirecallItemCard from './FirecallItems/FirecallItemCard';
import FirecallItemDialog from './FirecallItems/FirecallItemDialog';
import FirecallItemUpdateDialog from './FirecallItems/FirecallItemUpdateDialog';

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
      (item) => item.type === 'vehicle'
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
              name: `${item.name} ${item.fw || ''} abger??ckt`,
              beschreibung: `${item.besatzung ? '1:' + item.besatzung : ''} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
              original: item,
            } as Diary)
        ),
      firecallItems
        .filter(
          (item) => ['vehicle', 'diary'].indexOf(item.type) < 0 && item.datum
        )
        .map(
          (item) =>
            ({
              ...item,
              type: 'diary',
              editable: true,
              original: item,
            } as Diary)
        ),
      firecallItems
        .filter((item) => item.type === 'diary')
        .map((item) => ({ ...item, original: item, editable: true } as Diary)),
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
      .sort((a, b) => b.datum.localeCompare(a.datum))
      .map((a) => ({
        ...a,
        datum: moment(a.datum).format(dateTimeFormat),
      }));
    setDiaries(diaries);
  }, [firecallItems]);
  return diaries;
}

function DiaryButtons({ diary }: { diary: Diary }) {
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
          <Tooltip title={`${diary.name} l??schen`}>
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

function useGridColumns() {
  const [columns, setColumns] = useState<GridColDef[]>();
  useEffect(() => {
    setColumns([
      { field: 'name', headerName: 'Name', minWidth: 150, flex: 0.3 },
      { field: 'datum', headerName: 'Datum', flex: 0.3 },
      { field: 'beschreibung', headerName: 'Beschreibung', flex: 0.4 },
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
  boxHeight = '600px',
}: EinsatzTagebuchOptions) {
  const [tagebuchDialogIsOpen, setTagebuchDialogIsOpen] = useState(false);
  const { email } = useFirebaseLogin();
  const firecallId = useFirecallId();
  const diaries = useDiaries();
  const columns = useGridColumns();

  const diaryClose = useCallback(
    (item?: FirecallItem) => {
      setTagebuchDialogIsOpen(false);
      if (item) {
        addDoc(collection(firestore, 'call', firecallId, 'item'), {
          ...item,
          user: email,
          created: new Date(),
        });
      }
    },
    [email, firecallId]
  );

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
          <DataGrid
            rows={diaries}
            columns={columns}
            getRowId={(row) => row.id}
          />
        </Box>
      )}

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        onClick={() => setTagebuchDialogIsOpen(true)}
      >
        <AddIcon />
      </Fab>

      {tagebuchDialogIsOpen && (
        <FirecallItemDialog
          type="diary"
          onClose={diaryClose}
          allowTypeChange={false}
        />
      )}
    </>
  );
}
