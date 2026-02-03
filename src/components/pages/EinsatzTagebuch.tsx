'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import moment from 'moment';
import React, { useCallback, useEffect, useState } from 'react';
import { useFirecallAIQueryStream } from '../../app/ai/aiQuery';
import {
  dateTimeFormat,
  formatTimestamp,
  parseTimestamp,
} from '../../common/time-format';
import { useSpreadsheetDiaries } from '../../hooks/diaries';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import DeleteFirecallItemDialog from '../FirecallItems/DeleteFirecallItemDialog';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import { downloadRowsAsCsv } from '../firebase/download';
import {
  Diary,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  Fzg,
  filterActiveItems,
} from '../firebase/firestore';
import { DownloadButton } from '../inputs/DownloadButton';
import {
  useHistoryPathSegments,
  useMapEditorCanEdit,
} from '../../hooks/useMapEditor';

export function useDiaries(sortAscending: boolean = false) {
  const firecallId = useFirecallId();
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [diaryCounter, setDiaryCounter] = useState(1);
  const historyPathSegments = useHistoryPathSegments();
  const spreadsheetDiaries = useSpreadsheetDiaries();

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
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
              textRepresenation: `Fahrzeug ${item.name} ${item.fw} ${
                item.besatzung ? 'Besatzung 1:' + item.besatzung : ''
              } ${item.ats ? 'Atemschutzträger ' + item.ats : ''} ${
                item.alarmierung
                  ? 'alarmiert ' + formatTimestamp(item.alarmierung)
                  : ''
              } ${
                item.eintreffen
                  ? 'eintreffen ' + formatTimestamp(item.eintreffen)
                  : ''
              } ${
                item.abruecken
                  ? 'abruecken ' + formatTimestamp(item.abruecken)
                  : ''
              } Position ${item.lat},${item.lng}`,
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
              textRepresenation: `Fahrzeug ${item.name} ${item.fw} ${
                item.besatzung ? 'Besatzung 1:' + item.besatzung : ''
              } ${item.ats ? 'Atemschutzträger ' + item.ats : ''}  ${
                item.eintreffen
                  ? 'eintreffen ' + formatTimestamp(item.eintreffen)
                  : ''
              } Position ${item.lat},${item.lng}`,
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
              textRepresenation: `Fahrzeug ${item.name} ${item.fw} ${
                item.besatzung ? 'Besatzung 1:' + item.besatzung : ''
              } ${item.ats ? 'Atemschutzträger ' + item.ats : ''} ${
                item.abruecken
                  ? 'abruecken ' + formatTimestamp(item.abruecken)
                  : ''
              } Position ${item.lat},${item.lng}`,
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
        .map((item: FirecallItem) => item as Diary)
        .map(
          (item: Diary) =>
            ({
              ...item,
              original: item,
              editable: true,
              textRepresenation: `${formatTimestamp(item.datum)} ${
                item.art === 'B'
                  ? 'Befehl'
                  : item.art === 'F'
                  ? 'Frage'
                  : 'Meldung'
              } ${item.von ? 'von ' + item.von : ''} ${
                item.an ? 'an ' + item.an : ''
              }: ${item.name} ${item.beschreibung} ${
                item.erledigt
                  ? 'erledigt ' + formatTimestamp(item.erledigt)
                  : ''
              }`,
            } as Diary)
        ),
      spreadsheetDiaries,
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
      .sort((a, b) =>
        sortAscending
          ? a.datum.localeCompare(b.datum)
          : b.datum.localeCompare(a.datum)
      )
      .map((a) => ({
        ...a,
        datum: moment(a.datum).format(dateTimeFormat),
        erledigt: a.erledigt
          ? moment(a.erledigt).format(dateTimeFormat)
          : undefined,
      }));
    (async () => {
      setDiaries(diaries);
      setDiaryCounter(
        firecallEntries.filter((f) => f.type === 'diary' && f.nummer).length + 1
      );
    })();
  }, [firecallItems, sortAscending, spreadsheetDiaries]);
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

export interface EinsatzTagebuchOptions {
  showEditButton?: boolean;
  sortAscending?: boolean;
}
export function EinsatzTagebuch({
  showEditButton = true,
  sortAscending = false,
}: EinsatzTagebuchOptions) {
  const firecall = useFirecall();
  const [tagebuchDialogIsOpen, setTagebuchDialogIsOpen] = useState(false);
  const { diaries, diaryCounter } = useDiaries(sortAscending);
  const addEinsatzTagebuch = useFirecallItemAdd();
  const { query, resultHtml, isQuerying } = useFirecallAIQueryStream();

  const [inlineArt, setInlineArt] = useState<'M' | 'B' | 'F'>('M');
  const [inlineVon, setInlineVon] = useState('');
  const [inlineAn, setInlineAn] = useState('');
  const [inlineName, setInlineName] = useState('');
  const [inlineBeschreibung, setInlineBeschreibung] = useState('');

  const resetInlineForm = useCallback(() => {
    setInlineArt('M');
    setInlineVon('');
    setInlineAn('');
    setInlineName('');
    setInlineBeschreibung('');
  }, []);

  const handleInlineAdd = useCallback(() => {
    if (!inlineName.trim()) return;
    const newDiary: Diary = {
      type: 'diary',
      nummer: diaryCounter,
      datum: new Date().toISOString(),
      art: inlineArt,
      von: inlineVon,
      an: inlineAn,
      name: inlineName,
      beschreibung: inlineBeschreibung,
    };
    addEinsatzTagebuch(newDiary);
    resetInlineForm();
  }, [
    inlineArt,
    inlineVon,
    inlineAn,
    inlineName,
    inlineBeschreibung,
    diaryCounter,
    addEinsatzTagebuch,
    resetInlineForm,
  ]);

  const updateDescription = useCallback(async () => {
    const prompt = `Die Nachfolgenden Zeilen sind Einträge aus dem Einsatztagebuch des Feuerwehr Einsatzes ${
      firecall.name
    } ${firecall.description || ''} am ${formatTimestamp(
      firecall.alarmierung || firecall.date
    )}. Fasse den Einsatz und dessen Letztstand zusammen.\n\n${diaries
      .filter((d) => d.textRepresenation)
      .map((d) => d.textRepresenation)
      .join(`\n`)}`;
    query(prompt);
  }, [
    diaries,
    firecall.alarmierung,
    firecall.date,
    firecall.description,
    firecall.name,
    query,
  ]);

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
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Einsatz Tagebuch{' '}
          <DownloadButton
            onClick={() => downloadDiaries(diaries)}
            tooltip="Einsatz Tagebuch als CSV herunterladen"
          />
          <Button
            onClick={updateDescription}
            variant="outlined"
            disabled={isQuerying}
          >
            Zusammenfassung{' '}
            {isQuerying && <CircularProgress color="primary" size={20} />}
          </Button>
        </Typography>

        {resultHtml && (
          <Typography>
            <span dangerouslySetInnerHTML={{ __html: resultHtml }}></span>
          </Typography>
        )}

        <Grid container>
          <Grid size={{ xs: 3, md: 2, lg: 1 }}>
            <b>Nummer</b>
          </Grid>
          <Grid size={{ xs: 6, md: 5, lg: 2 }}>
            <b>Datum</b>
          </Grid>
          <Grid size={{ xs: 12, md: 5, lg: 2 }}>
            <b>typ von -&gt; an</b>
          </Grid>
          <Grid size={{ xs: 12, md: 5, lg: 3 }}>
            <b>Eintrag</b>
          </Grid>
          <Grid size={{ xs: 12, md: 5, lg: 3 }}>
            <b>Beschreibung</b>
          </Grid>
          <Grid size={{ xs: 12, md: 2, lg: 1 }}></Grid>

          {showEditButton && (
            <>
              <Grid
                size={{ md: 2, lg: 1 }}
                sx={{ display: { xs: 'none', md: 'block' }, py: 1 }}
              >
                {diaryCounter}
              </Grid>
              <Grid
                size={{ md: 5, lg: 2 }}
                sx={{ display: { xs: 'none', md: 'block' }, py: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  jetzt
                </Typography>
              </Grid>
              <Grid
                size={{ md: 5, lg: 2 }}
                sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, py: 1 }}
              >
                <FormControl size="small" sx={{ minWidth: 60 }}>
                  <Select
                    value={inlineArt}
                    onChange={(e) =>
                      setInlineArt(e.target.value as 'M' | 'B' | 'F')
                    }
                    size="small"
                  >
                    <MenuItem value="M">M</MenuItem>
                    <MenuItem value="B">B</MenuItem>
                    <MenuItem value="F">F</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  placeholder="von"
                  value={inlineVon}
                  onChange={(e) => setInlineVon(e.target.value)}
                  sx={{ flex: 1, minWidth: 60 }}
                />
                <TextField
                  size="small"
                  placeholder="an"
                  value={inlineAn}
                  onChange={(e) => setInlineAn(e.target.value)}
                  sx={{ flex: 1, minWidth: 60 }}
                />
              </Grid>
              <Grid
                size={{ md: 5, lg: 3 }}
                sx={{ display: { xs: 'none', md: 'block' }, py: 1 }}
              >
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
              <Grid
                size={{ md: 5, lg: 3 }}
                sx={{ display: { xs: 'none', md: 'block' }, py: 1 }}
              >
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
              <Grid
                size={{ md: 2, lg: 1 }}
                sx={{ display: { xs: 'none', md: 'block' }, py: 1 }}
              >
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
            </>
          )}

          {diaries.map((e, index) => (
            <React.Fragment
              key={`tagebuch-${e.id || index}-${e.nummer}`}
            >
              <Grid
                size={{ xs: 3, md: 2, lg: 1 }}
                sx={(theme) => ({
                  backgroundColor: index % 2 === 1 ? '#eee' : undefined,
                })}
              >
                {e.nummer}
              </Grid>
              <Grid
                size={{ xs: 6, md: 5, lg: 2 }}
                sx={(theme) => ({
                  backgroundColor: index % 2 === 1 ? '#eee' : undefined,
                })}
              >
                {e.datum}
              </Grid>
              <Grid
                size={{ xs: 12, md: 5, lg: 2 }}
                sx={(theme) => ({
                  backgroundColor: index % 2 === 1 ? '#eee' : undefined,
                })}
              >
                {e.art} {e.von} {(e.von || e.an) && '->'} {e.an}
              </Grid>
              <Grid
                size={{ xs: 12, md: 5, lg: 3 }}
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
                {showEditButton && <DiaryButtons diary={e}></DiaryButtons>}
              </Grid>
            </React.Fragment>
          ))}
        </Grid>
      </Box>

      {showEditButton && (
        <Fab
          color="primary"
          aria-label="add"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => setTagebuchDialogIsOpen(true)}
        >
          <AddIcon />
        </Fab>
      )}

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

export default function Tagebuch({
  showEditButton = true,
  sortAscending = false,
}: EinsatzTagebuchOptions) {
  const firecallId = useFirecallId();
  const canEdit = useMapEditorCanEdit();

  if (firecallId === 'unknown') {
    return (
      <Typography variant="h3" gutterBottom>
        Einsatz Tagebuch
      </Typography>
    );
  }

  return (
    <EinsatzTagebuch
      showEditButton={showEditButton && canEdit}
      sortAscending={sortAscending}
    />
  );
}
