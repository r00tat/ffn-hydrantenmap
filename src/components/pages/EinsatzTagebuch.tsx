'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { randomUUID } from 'crypto';
import moment from 'moment';
import React, { useCallback, useEffect, useState } from 'react';
import {
  dateTimeFormat,
  formatTimestamp,
  parseTimestamp,
} from '../../common/time-format';
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
  FirecallItem,
  Fzg,
  filterActiveItems,
} from '../firebase/firestore';
import { DownloadButton } from '../inputs/DownloadButton';
import { askGemini } from '../firebase/vertexai';
import { marked } from 'marked';

export function useDiaries(sortAscending: boolean = false) {
  const firecallId = useFirecallId();
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [diaryCounter, setDiaryCounter] = useState(1);

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
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
    setDiaries(diaries);
    setDiaryCounter(
      firecallEntries.filter((f) => f.type === 'diary' && f.nummer).length + 1
    );
  }, [firecallItems, sortAscending]);
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

  const [diarySummary, setDiarySummary] = useState<string>('');

  useEffect(() => {
    if (diaries.length > 0) {
      (async () => {
        const prompt = `Die Nachfolgenden Zeilen sind Einträge aus dem Einsatztagebuch des Feuerwehr Einsatzes ${
          firecall.name
        } am ${formatTimestamp(
          firecall.alarmierung || firecall.date
        )}. Fasse den Einsatz und dessen Letztstand zusammen.\n\n${diaries
          .filter((d) => d.textRepresenation)
          .map((d) => d.textRepresenation)
          .join(`\n`)}`;
        const resultText = await askGemini(prompt);
        const htmlText = await marked(resultText);
        setDiarySummary(htmlText);
      })();
    }
  }, [diaries, firecall.alarmierung, firecall.date, firecall.name]);

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
        </Typography>

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
          {diaries.map((e) => (
            <React.Fragment
              key={`tagebuch-${e.id || randomUUID()}-${e.nummer}`}
            >
              <Grid size={{ xs: 3, md: 2, lg: 1 }}>{e.nummer}</Grid>
              <Grid size={{ xs: 6, md: 5, lg: 2 }}>{e.datum}</Grid>
              <Grid size={{ xs: 12, md: 5, lg: 2 }}>
                {e.art} {e.von} {(e.von || e.an) && '->'} {e.an}
              </Grid>
              <Grid size={{ xs: 12, md: 5, lg: 3 }}>
                <b>
                  {e.name?.split(`\n`).map((line, index) => (
                    <React.Fragment key={`title-${e.id}-${index}`}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                </b>
              </Grid>
              <Grid size={{ xs: 12, md: 5, lg: 3 }}>
                {e.beschreibung?.split('\n').map((line, index) => (
                  <React.Fragment key={`beschreibung-${e.id}-${index}`}>
                    {line}
                    <br />
                  </React.Fragment>
                ))}
              </Grid>
              <Grid size={{ xs: 12, md: 2, lg: 1 }}>
                {showEditButton && <DiaryButtons diary={e}></DiaryButtons>}
              </Grid>
            </React.Fragment>
          ))}
        </Grid>

        {diarySummary && (
          <Typography>
            <span dangerouslySetInnerHTML={{ __html: diarySummary }}></span>
          </Typography>
        )}
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

  if (firecallId === 'unknown') {
    return (
      <Typography variant="h3" gutterBottom>
        Einsatz Tagebuch
      </Typography>
    );
  }

  return (
    <EinsatzTagebuch
      showEditButton={showEditButton}
      sortAscending={sortAscending}
    />
  );
}
