'use client';

import AddIcon from '@mui/icons-material/Add';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { where } from 'firebase/firestore';
import moment from 'moment';
import React, { useCallback, useEffect, useState } from 'react';
import {
  dateTimeFormat,
  formatTimestamp,
  parseTimestamp,
} from '../../common/time-format';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import {
  useHistoryPathSegments,
  useMapEditorCanEdit,
} from '../../hooks/useMapEditor';
import DeleteFirecallItemDialog from '../FirecallItems/DeleteFirecallItemDialog';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import { downloadRowsAsCsv } from '../firebase/download';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  GeschaeftsbuchEintrag,
  filterActiveItems,
} from '../firebase/firestore';
import { DownloadButton } from '../inputs/DownloadButton';

interface GbDisplay extends GeschaeftsbuchEintrag {
  einaus: string;
}

export function useGeschaeftsbuchEintraege(sortAscending: boolean = false) {
  const firecallId = useFirecallId();

  const [eintraege, setGeschaeftsbuchEintraege] = useState<GbDisplay[]>([]);
  const [diaryCounter, setDiaryCounter] = useState(1);
  const historyPathSegments = useHistoryPathSegments();

  const firecallItems = useFirebaseCollection<GeschaeftsbuchEintrag>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
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
    (async () => {
      setGeschaeftsbuchEintraege(diaries);
      setDiaryCounter(diaries.length + 1);
    })();
  }, [firecallItems, sortAscending]);
  return { eintraege, diaryCounter };
}

export function DiaryButtons({
  diary,
  funktion,
}: {
  diary: GeschaeftsbuchEintrag;
  funktion?: string;
}) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const updateItem = useFirecallItemUpdate();
  const isGelesen =
    funktion !== undefined &&
    (diary.gelesen || '')
      .toLowerCase()
      .split(/ *, */)
      .includes(funktion?.toLowerCase());

  return (
    <>
      {diary.editable && (
        <>
          {funktion && (
            <>
              {isGelesen && (
                <Tooltip title="gelesen">
                  <CheckBoxIcon color="success" />
                </Tooltip>
              )}

              {!isGelesen && (
                <Tooltip title="Als gelesen markieren">
                  <IconButton
                    onClick={() => {
                      updateItem({
                        ...diary,
                        gelesen: [
                          ...(diary.gelesen || '').split(/ *, */),
                          funktion,
                        ].join(','),
                      } as GeschaeftsbuchEintrag);
                    }}
                  >
                    <CheckBoxIcon />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
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
      'Auszeichnung',
      'Erledigt',
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
      d.erledigt != ''
        ? formatTimestamp(parseTimestamp(d.datum)?.toDate())
        : '',
    ]),
  ];
  downloadRowsAsCsv(rows, 'Geschaeftsbuch.csv');
}

function GbEntries({
  eintraege,
  showEditButton,
  funktion,
}: {
  eintraege: GbDisplay[];
  showEditButton?: boolean;
  funktion?: string;
}) {
  return (
    <Grid container>
      <Grid size={{ xs: 3, md: 2, lg: 1 }}>
        <b>Nummer</b>
      </Grid>
      <Grid size={{ xs: 6, md: 4, lg: 2 }}>
        <b>Datum</b>
      </Grid>
      <Grid size={{ xs: 12, md: 4, lg: 2 }}>
        <b>von -&gt; an</b>
      </Grid>
      <Grid size={{ xs: 12, md: 5, lg: 2 }}>
        <b>Name</b>
      </Grid>
      <Grid size={{ xs: 12, md: 5, lg: 3 }}>
        <b>Beschreibung</b>
      </Grid>
      <Grid size={{ xs: 12, md: 2, lg: 1 }}>
        <b>Erledigt</b>
      </Grid>
      <Grid size={{ xs: 12, md: 2, lg: 1 }}></Grid>
      {eintraege.map((e, index) => (
        <React.Fragment key={'gb-' + e.id}>
          <Grid
            size={{ xs: 3, md: 2, lg: 1 }}
            sx={(theme) => ({
              backgroundColor: index % 2 === 1 ? '#eee' : undefined,
            })}
          >
            {e.nummer}
          </Grid>
          <Grid
            size={{ xs: 6, md: 4, lg: 2 }}
            sx={(theme) => ({
              backgroundColor: index % 2 === 1 ? '#eee' : undefined,
            })}
          >
            {e.datum}
          </Grid>
          <Grid
            size={{ xs: 12, md: 4, lg: 2 }}
            sx={(theme) => ({
              backgroundColor: index % 2 === 1 ? '#eee' : undefined,
            })}
          >
            {e.einaus} {e.von} -&gt; {e.an} ({e.weiterleitung})
          </Grid>
          <Grid
            size={{ xs: 12, md: 5, lg: 2 }}
            sx={(theme) => ({
              backgroundColor: index % 2 === 1 ? '#eee' : undefined,
            })}
          >
            <b>
              {e.name?.split(`\n`).map((line, index) => (
                <React.Fragment key={`title-${e.id}-${index}`}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </b>
          </Grid>
          <Grid
            size={{ xs: 12, md: 5, lg: 3 }}
            sx={(theme) => ({
              backgroundColor: index % 2 === 1 ? '#eee' : undefined,
            })}
          >
            {e.beschreibung?.split('\n').map((line, index) => (
              <React.Fragment key={`beschreibung-${e.id}-${index}`}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </Grid>
          <Grid
            size={{ xs: 12, md: 2, lg: 1 }}
            sx={(theme) => ({
              backgroundColor: index % 2 === 1 ? '#eee' : undefined,
            })}
          >
            {e.erledigt && formatTimestamp(e.erledigt)}
          </Grid>

          <Grid
            size={{ xs: 12, md: 2, lg: 1 }}
            sx={(theme) => ({
              backgroundColor: index % 2 === 1 ? '#eee' : undefined,
            })}
          >
            {showEditButton && (
              <DiaryButtons diary={e} funktion={funktion}></DiaryButtons>
            )}
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
  const canEdit = useMapEditorCanEdit();

  const addFirecallGb = useFirecallItemAdd();

  const [inlineAusgehend, setInlineAusgehend] = useState(false);
  const [inlineVon, setInlineVon] = useState('');
  const [inlineAn, setInlineAn] = useState('');
  const [inlineName, setInlineName] = useState('');
  const [inlineBeschreibung, setInlineBeschreibung] = useState('');
  const [inlineWeiterleitung, setInlineWeiterleitung] = useState('');

  const resetInlineForm = useCallback(() => {
    setInlineAusgehend(false);
    setInlineVon('');
    setInlineAn('');
    setInlineName('');
    setInlineBeschreibung('');
    setInlineWeiterleitung('');
  }, []);

  const handleInlineAdd = useCallback(() => {
    if (!inlineName.trim()) return;
    const newEntry: GeschaeftsbuchEintrag = {
      type: 'gb',
      nummer: diaryCounter,
      datum: new Date().toISOString(),
      ausgehend: inlineAusgehend,
      von: inlineVon,
      an: inlineAn,
      name: inlineName,
      beschreibung: inlineBeschreibung,
      weiterleitung: inlineWeiterleitung,
    };
    addFirecallGb(newEntry);
    resetInlineForm();
  }, [
    inlineAusgehend,
    inlineVon,
    inlineAn,
    inlineName,
    inlineBeschreibung,
    inlineWeiterleitung,
    diaryCounter,
    addFirecallGb,
    resetInlineForm,
  ]);

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

        {showEditButton && canEdit && (
          <Grid
            container
            sx={{ display: { xs: 'none', md: 'flex' }, py: 1, alignItems: 'center' }}
          >
            <Grid size={{ md: 2, lg: 1 }}>{diaryCounter}</Grid>
            <Grid size={{ md: 4, lg: 2 }}>
              <Typography variant="body2" color="text.secondary">
                jetzt
              </Typography>
            </Grid>
            <Grid
              size={{ md: 4, lg: 2 }}
              sx={{ display: 'flex', gap: 1 }}
            >
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <Select
                  value={inlineAusgehend ? 'aus' : 'ein'}
                  onChange={(e) =>
                    setInlineAusgehend(e.target.value === 'aus')
                  }
                  size="small"
                >
                  <MenuItem value="ein">Ein</MenuItem>
                  <MenuItem value="aus">Aus</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="von"
                value={inlineVon}
                onChange={(e) => setInlineVon(e.target.value)}
                sx={{ flex: 1, minWidth: 50 }}
              />
              <TextField
                size="small"
                placeholder="an"
                value={inlineAn}
                onChange={(e) => setInlineAn(e.target.value)}
                sx={{ flex: 1, minWidth: 50 }}
              />
            </Grid>
            <Grid size={{ md: 5, lg: 2 }}>
              <TextField
                size="small"
                placeholder="Information"
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                fullWidth
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleInlineAdd();
                  }
                }}
              />
            </Grid>
            <Grid size={{ md: 5, lg: 3 }}>
              <TextField
                size="small"
                placeholder="Anmerkung"
                value={inlineBeschreibung}
                onChange={(e) => setInlineBeschreibung(e.target.value)}
                fullWidth
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleInlineAdd();
                  }
                }}
              />
            </Grid>
            <Grid size={{ md: 2, lg: 1 }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={inlineWeiterleitung}
                  onChange={(e) =>
                    setInlineWeiterleitung(e.target.value)
                  }
                  size="small"
                  displayEmpty
                >
                  <MenuItem value="">-</MenuItem>
                  {Object.keys(sFunktionen).map((key) => (
                    <MenuItem value={key} key={`inline-wl-${key}`}>
                      {key}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ md: 2, lg: 1 }}>
              <Tooltip title="Eintrag hinzufügen">
                <IconButton
                  color="primary"
                  onClick={handleInlineAdd}
                  disabled={!inlineName.trim()}
                >
                  <AddIcon />
                </IconButton>
              </Tooltip>
            </Grid>
          </Grid>
        )}

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
            <GbEntries
              eintraege={eintraege}
              showEditButton={showEditButton && canEdit}
            />
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
                showEditButton={showEditButton && canEdit}
                funktion={key}
              />
            </TabPanel>
          ))}
        </TabContext>
      </Box>
      {showEditButton && canEdit && (
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
