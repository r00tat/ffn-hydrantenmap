'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
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
  FIRECALL_COLLECTION_ID,
  FirecallItem,
  GeschaeftsbuchEintrag,
  filterActiveItems,
} from '../firebase/firestore';

import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import Grid from '@mui/material/Grid';
import Tab from '@mui/material/Tab';
import React from 'react';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { downloadRowsAsCsv } from '../firebase/download';
import { DownloadButton } from '../inputs/DownloadButton';

interface GbDisplay extends GeschaeftsbuchEintrag {
  einaus: string;
}

export function useGeschaeftsbuchEintraege(sortAscending: boolean = false) {
  const firecallId = useFirecallId();

  const [eintraege, setGeschaeftsbuchEintraege] = useState<GbDisplay[]>([]);
  const [diaryCounter, setDiaryCounter] = useState(1);

  const firecallItems = useFirebaseCollection<GeschaeftsbuchEintrag>({
    collectionName: FIRECALL_COLLECTION_ID,
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
      .sort((a, b) =>
        sortAscending
          ? a.datum.localeCompare(b.datum)
          : b.datum.localeCompare(a.datum)
      )
      .map((a) => ({
        ...a,
        datum: moment(a.datum).format(dateTimeFormat),
        editable: true,
        einaus: a.ausgehend ? 'ausgehend' : 'eingehend',
      }));
    setGeschaeftsbuchEintraege(diaries);
    setDiaryCounter(diaries.length + 1);
  }, [firecallItems, sortAscending]);
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

async function downloadGb(eintraege: GbDisplay[]) {
  const rows: any[][] = [
    [
      'Nummer',
      'Datum',
      'Ein/Aus',
      'Von',
      'An',
      'Art',
      'Information',
      'Anmerkung',
      'Weiterleitung',
    ],
    ...eintraege.map((d) => [
      d.nummer,
      formatTimestamp(parseTimestamp(d.datum)?.toDate()),
      d.einaus,
      d.von,
      d.an,
      // d.art,
      d.name,
      d.beschreibung,
      // d.erledigt ? formatTimestamp(d.erledigt) : '',
      d.weiterleitung || '',
    ]),
  ];
  downloadRowsAsCsv(rows, 'Geschaeftsbuch.csv');
}

function GbEntries({
  eintraege,
  showEditButton,
}: {
  eintraege: GbDisplay[];
  showEditButton?: boolean;
}) {
  return (
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
            {e.einaus} {e.von} -&gt; {e.an} ({e.weiterleitung})
          </Grid>
          <Grid item xs={12} md={5} lg={3}>
            <b>
              {e.name?.split(`\n`).map((line, index) => (
                <React.Fragment key={`title-${e.id}-${index}`}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </b>
          </Grid>
          <Grid item xs={12} md={5} lg={3}>
            {e.beschreibung?.split('\n').map((line, index) => (
              <React.Fragment key={`beschreibung-${e.id}-${index}`}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </Grid>
          <Grid item xs={12} md={2} lg={1}>
            {showEditButton && <DiaryButtons diary={e}></DiaryButtons>}
          </Grid>
        </React.Fragment>
      ))}
    </Grid>
  );
}

const sFunktionen: { [key: string]: string } = {
  S1: 'Personal',
  S2: 'Lage',
  S3: 'Einsatz',
  S4: 'Versorgung',
  S5: 'Öffentlichkeitsarbeit',
  S6: 'Kommunikation',
};

export interface GeschaeftsbuchOptions {
  showEditButton?: boolean;
  sortAscending?: boolean;
}
export default function Geschaeftsbuch({
  showEditButton = true,
  sortAscending = false,
}: GeschaeftsbuchOptions) {
  const [dialogIsOpen, setDialogIsOpen] = useState(false);
  const { eintraege, diaryCounter } = useGeschaeftsbuchEintraege(sortAscending);

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

  const [tabValue, setTabValue] = React.useState('all');

  const handleTabSelect = (event: React.SyntheticEvent, newValue: string) => {
    setTabValue(newValue);
  };

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Geschäftsbuch{' '}
          <DownloadButton
            onClick={() => downloadGb(eintraege)}
            tooltip="Geschäftsbuch als CSV herunterladen"
          />
        </Typography>
        {/* <GeschaeftsbuchAdd /> */}

        <TabContext value={tabValue}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <TabList
              onChange={handleTabSelect}
              aria-label="Nachrichten für S-Funktionen"
              variant="fullWidth"
            >
              <Tab label="Alle Einträge" value="all" />
              {Object.entries(sFunktionen).map(([key, value]) => (
                <Tab
                  label={`${key} ${value}`}
                  value={key}
                  key={`s-function-tab-${key}`}
                />
              ))}
            </TabList>
          </Box>

          <TabPanel value="all">
            <GbEntries eintraege={eintraege} showEditButton={showEditButton} />
          </TabPanel>
          {Object.entries(sFunktionen).map(([key, title]) => (
            <TabPanel value={key} key={key}>
              <GbEntries
                eintraege={eintraege.filter(
                  (e) =>
                    e.weiterleitung &&
                    e?.weiterleitung
                      .toLowerCase()
                      .split(/ *, */)
                      .indexOf(key.toLowerCase()) > -1
                )}
                showEditButton={showEditButton}
              />
            </TabPanel>
          ))}
        </TabContext>
      </Box>

      {showEditButton && (
        <Fab
          color="primary"
          aria-label="add"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => setDialogIsOpen(true)}
        >
          <AddIcon />
        </Fab>
      )}

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
