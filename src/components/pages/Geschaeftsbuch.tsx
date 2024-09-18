'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GridColDef } from '@mui/x-data-grid';
import { where } from 'firebase/firestore';
import moment from 'moment';
import { useCallback, useEffect, useState } from 'react';
import {
  dateTimeFormat,
  formatTimestamp,
  parseTimestamp,
} from '../../common/time-format';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import DeleteFirecallItemDialog from '../FirecallItems/DeleteFirecallItemDialog';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import {
  FirecallItem,
  GeschaeftsbuchEintrag,
  filterActiveItems,
} from '../firebase/firestore';

import Grid from '@mui/material/Grid';
import React from 'react';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { downloadRowsAsCsv } from '../firebase/download';
import { DownloadButton } from '../inputs/DownloadButton';

interface GbDisplay extends GeschaeftsbuchEintrag {
  einaus: string;
}

export function useGeschaeftsbuchEintraege() {
  const firecallId = useFirecallId();

  const [eintraege, setGeschaeftsbuchEintraege] = useState<GbDisplay[]>([]);
  const [diaryCounter, setDiaryCounter] = useState(1);

  const firecallItems = useFirebaseCollection<GeschaeftsbuchEintrag>({
    collectionName: 'call',
    pathSegments: [firecallId, 'item'],
    queryConstraints: [where('type', '==', 'gb')],
    // queryConstraints: [],
    filterFn: filterActiveItems,
  });

  useEffect(() => {
    const diaries = firecallItems
      .map((a) => {
        const m = parseTimestamp(a.datum);
        if (m) {
          a.datum = m.format();
        } else {
          a.datum = new Date().toISOString();
        }
        return a;
      })
      .sort((a, b) => (a.nummer ?? 0) - (b.nummer ?? 0))
      .map((a) => ({
        ...a,
        datum: moment(a.datum).format(dateTimeFormat),
        editable: true,
        einaus: a.ausgehend ? 'ausgehend' : 'eingehend',
      }));
    setGeschaeftsbuchEintraege(diaries);
    setDiaryCounter(diaries.length + 1);
  }, [firecallItems]);
  return { eintraege, diaryCounter };
}

export function DiaryButtons({ diary }: { diary: GeschaeftsbuchEintrag }) {
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
      { field: 'einaus', headerName: 'Ein/Ausgehend', minWidth: 50, flex: 0.1 },
      { field: 'von', headerName: 'Von', minWidth: 50, flex: 0.1 },
      { field: 'an', headerName: 'An', minWidth: 50, flex: 0.1 },
      { field: 'name', headerName: 'Information', minWidth: 100, flex: 0.2 },
      { field: 'beschreibung', headerName: 'Anmerkung', flex: 0.2 },
      {
        field: 'buttons',
        headerName: 'Aktionen',
        flex: 0.1,
        renderCell: (params) => (
          <DiaryButtons diary={params.row as GeschaeftsbuchEintrag} />
        ),
      },
    ]);
  }, []);
  return columns;
}

async function downloadGb(eintraege: GbDisplay[]) {
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
    ...eintraege.map((d) => [
      d.nummer,
      formatTimestamp(d.datum),
      d.einaus,
      d.von,
      d.an,
      // d.art,
      d.name,
      d.beschreibung,
      // d.erledigt ? formatTimestamp(d.erledigt) : '',
    ]),
  ];
  downloadRowsAsCsv(rows, 'Geschaeftsbuch.csv');
}

function GeschaeftsbuchAdd() {
  // TODO
  return (
    <>
      <Grid container>
        <Grid item xs={3} lg={1}>
          <b>Nummer</b>
        </Grid>
        <Grid item xs={6} lg={2}>
          <b>Datum</b>
        </Grid>
        <Grid item xs={12} lg={2}>
          <b>von -&gt; an</b>
        </Grid>
        <Grid item xs={12} lg={3}>
          <b>Name</b>
        </Grid>
        <Grid item xs={12} lg={3}>
          <b>Beschreibung</b>
        </Grid>
      </Grid>
    </>
  );
}

export interface GeschaeftsbuchOptions {
  boxHeight?: string;
}
export default function Geschaeftsbuch({
  boxHeight = '1000px',
}: GeschaeftsbuchOptions) {
  const [dialogIsOpen, setDialogIsOpen] = useState(false);
  const { eintraege, diaryCounter } = useGeschaeftsbuchEintraege();
  const columns = useGridColumns();
  const addFirecallGb = useFirecallItemAdd();

  const diaryClose = useCallback(
    (item?: FirecallItem) => {
      setDialogIsOpen(false);
      if (item) {
        addFirecallGb(item);
      }
    },
    [addFirecallGb]
  );

  return (
    <>
      {columns && (
        <Box sx={{ p: 2, m: 2, height: boxHeight }}>
          <Typography variant="h3" gutterBottom>
            Geschäftsbuch{' '}
            <DownloadButton
              onClick={() => downloadGb(eintraege)}
              tooltip="Geschäftsbuch als CSV herunterladen"
            />
          </Typography>
          {/* <GeschaeftsbuchAdd /> */}

          <Grid container>
            <Grid item xs={3} md={2} lg={1}>
              <b>Nummer</b>
            </Grid>
            <Grid item xs={6} md={5} lg={2}>
              <b>Datum</b>
            </Grid>
            <Grid item xs={12} md={5} lg={2}>
              <b>von -&gt; an</b>
            </Grid>
            <Grid item xs={12} md={5} lg={3}>
              <b>Name</b>
            </Grid>
            <Grid item xs={12} md={5} lg={3}>
              <b>Beschreibung</b>
            </Grid>
            <Grid item xs={12} md={2} lg={1}></Grid>
            {eintraege.map((e) => (
              <React.Fragment key={'gb-' + e.id}>
                <Grid item xs={3} md={2} lg={1}>
                  {e.nummer}
                </Grid>
                <Grid item xs={6} md={5} lg={2}>
                  {e.datum}
                </Grid>
                <Grid item xs={12} md={5} lg={2}>
                  {e.einaus} {e.von} -&gt; {e.an}
                </Grid>
                <Grid item xs={12} md={5} lg={3}>
                  <b>{e.name}</b>
                </Grid>
                <Grid item xs={12} md={5} lg={3}>
                  {e.beschreibung}
                </Grid>
                <Grid item xs={12} md={2} lg={1}>
                  <DiaryButtons diary={e}></DiaryButtons>
                </Grid>
              </React.Fragment>
            ))}
          </Grid>
          {/* <DataGrid
            rows={eintraege}
            columns={columns}
            getRowId={(row) => row.id}
          /> */}
        </Box>
      )}

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setDialogIsOpen(true)}
      >
        <AddIcon />
      </Fab>

      {dialogIsOpen && (
        <FirecallItemDialog
          type="gb"
          item={{ type: 'gb', nummer: diaryCounter } as GeschaeftsbuchEintrag}
          onClose={diaryClose}
          allowTypeChange={false}
        />
      )}
    </>
  );
}
