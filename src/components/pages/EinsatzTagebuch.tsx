'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
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
import { useTranslations } from 'next-intl';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useFirecallAIQueryStream } from '../../app/ai/aiQuery';
import {
  dateTimeFormat,
  formatTimestamp,
  parseTimestamp,
} from '../../common/time-format';
import { getEffectiveBesatzung } from '../../common/vehicle-utils';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirecall, {
  FirecallContext,
  useFirecallId,
} from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { useFirecallItems } from '../firebase/firestoreHooks';
import AiAssistantButton from '../Map/AiAssistantButton';
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
  const t = useTranslations('tagebuch');
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [diaryCounter, setDiaryCounter] = useState(1);
  const historyPathSegments = useHistoryPathSegments();
  const { crewAssignments } = useContext(FirecallContext);

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

    const crewCountMap = new Map<string, number>();
    for (const c of crewAssignments) {
      if (c.vehicleId) {
        crewCountMap.set(
          c.vehicleId,
          (crewCountMap.get(c.vehicleId) || 0) + 1
        );
      }
    }

    const getBesatzungText = (item: Fzg) => {
      const bes = getEffectiveBesatzung(
        item.besatzung,
        crewCountMap.get(item.id || '') ?? 0
      );
      return bes > 0 ? '1:' + bes : '';
    };

    const fmtBesatzung = (item: Fzg) => {
      const bt = getBesatzungText(item);
      return bt ? 'Besatzung ' + bt : '';
    };
    const fmtAts = (item: Fzg) => (item.ats ? 'ATS ' + item.ats : '');

    const firecallEntries: Diary[] = [
      cars
        .filter((item) => item.alarmierung)
        .map(
          (item) =>
            ({
              id: 'alarmierung' + item.id,
              datum: item.alarmierung,
              type: 'diary',
              name: t('vehicleAlerted', {
                name: item.name,
                fw: item.fw || '',
              }),
              beschreibung: `${getBesatzungText(item)} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
              original: item,
              textRepresenation: t('vehicleTextAlerted', {
                name: item.name,
                fw: item.fw || '',
                besatzung: fmtBesatzung(item),
                ats: fmtAts(item),
                alarmiert: item.alarmierung
                  ? formatTimestamp(item.alarmierung)
                  : '',
                eintreffen: item.eintreffen
                  ? formatTimestamp(item.eintreffen)
                  : '',
                abruecken: item.abruecken
                  ? formatTimestamp(item.abruecken)
                  : '',
                lat: item.lat ?? '',
                lng: item.lng ?? '',
              }),
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
              name: t('vehicleArrived', {
                name: item.name,
                fw: item.fw || '',
              }),
              beschreibung: `${getBesatzungText(item)} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
              original: item,
              textRepresenation: t('vehicleTextArrived', {
                name: item.name,
                fw: item.fw || '',
                besatzung: fmtBesatzung(item),
                ats: fmtAts(item),
                eintreffen: item.eintreffen
                  ? formatTimestamp(item.eintreffen)
                  : '',
                lat: item.lat ?? '',
                lng: item.lng ?? '',
              }),
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
              name: t('vehicleDeparted', {
                name: item.name,
                fw: item.fw || '',
              }),
              beschreibung: `${getBesatzungText(item)} ${
                item.ats ? 'ATS ' + item.ats : ''
              }`,
              editable: false,
              original: item,
              textRepresenation: t('vehicleTextDeparted', {
                name: item.name,
                fw: item.fw || '',
                besatzung: fmtBesatzung(item),
                ats: fmtAts(item),
                abruecken: item.abruecken
                  ? formatTimestamp(item.abruecken)
                  : '',
                lat: item.lat ?? '',
                lng: item.lng ?? '',
              }),
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
                  ? t('type.B')
                  : item.art === 'F'
                    ? t('type.F')
                    : t('type.M')
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
      // sort ascending by timestamp to assign sequential numbers
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .map((a, index) => ({
        ...a,
        nummer: index + 1,
      }))
      // apply requested display sort order
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
      setDiaryCounter(diaries.length + 1);
    })();
  }, [firecallItems, sortAscending, crewAssignments, t]);
  return { diaries, diaryCounter };
}

function downloadDiaries(
  diaries: Diary[],
  t: ReturnType<typeof useTranslations<'tagebuch'>>,
) {
  const rows: any[][] = [
    [
      t('col.number'),
      t('col.date'),
      t('col.from'),
      t('col.to'),
      t('col.type'),
      t('col.info'),
      t('col.comment'),
      t('col.done'),
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
  downloadRowsAsCsv(rows, t('csvFilename'));
}

export function DiaryButtons({ diary }: { diary: Diary }) {
  const t = useTranslations('tagebuch');
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  return (
    <>
      {diary.editable && (
        <>
          <Tooltip title={t('editEntry', { name: diary.name })}>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setDisplayUpdateDialog(true);
              }}
            >
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('deleteEntry', { name: diary.name })}>
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
type DiarySortField = 'nummer' | 'datum' | 'art' | 'name' | 'beschreibung';

function SortableHeader({
  label,
  field,
  activeField,
  direction,
  onClick,
}: {
  label: string;
  field: DiarySortField;
  activeField: DiarySortField;
  direction: 'asc' | 'desc';
  onClick: (field: DiarySortField) => void;
}) {
  const isActive = field === activeField;
  return (
    <Box
      onClick={() => onClick(field)}
      sx={{
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        userSelect: 'none',
        '&:hover': { opacity: 0.7 },
      }}
    >
      <b>{label}</b>
      {isActive &&
        (direction === 'asc' ? (
          <ArrowUpwardIcon sx={{ fontSize: 16 }} />
        ) : (
          <ArrowDownwardIcon sx={{ fontSize: 16 }} />
        ))}
    </Box>
  );
}

function compareDiaryField(
  a: Diary,
  b: Diary,
  field: DiarySortField,
  direction: 'asc' | 'desc'
): number {
  let result: number;
  switch (field) {
    case 'nummer':
      result = (a.nummer ?? 0) - (b.nummer ?? 0);
      break;
    case 'datum':
      result = (a.datum || '').localeCompare(b.datum || '');
      break;
    case 'art':
      result = (a.art || '').localeCompare(b.art || '');
      break;
    case 'name':
      result = (a.name || '').localeCompare(b.name || '');
      break;
    case 'beschreibung':
      result = (a.beschreibung || '').localeCompare(b.beschreibung || '');
      break;
    default:
      result = 0;
  }
  return direction === 'asc' ? result : -result;
}

export function EinsatzTagebuch({
  showEditButton = true,
  sortAscending = false,
}: EinsatzTagebuchOptions) {
  const t = useTranslations('tagebuch');
  const firecall = useFirecall();
  const [tagebuchDialogIsOpen, setTagebuchDialogIsOpen] = useState(false);
  const { diaries, diaryCounter } = useDiaries(sortAscending);
  const addEinsatzTagebuch = useFirecallItemAdd();
  const firecallItems = useFirecallItems();

  const [sortField, setSortField] = useState<DiarySortField>('datum');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    sortAscending ? 'asc' : 'desc'
  );

  const handleSortClick = useCallback((field: DiarySortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const sortedDiaries = useMemo(
    () =>
      [...diaries].sort((a, b) =>
        compareDiaryField(a, b, sortField, sortDirection)
      ),
    [diaries, sortField, sortDirection]
  );
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
    const prompt = t('summaryPrompt', {
      name: firecall.name,
      description: firecall.description || '',
      date: formatTimestamp(firecall.date),
      entries: diaries
        .filter((d) => d.textRepresenation)
        .map((d) => d.textRepresenation)
        .join('\n'),
    });
    query(prompt);
  }, [
    diaries,
    firecall.date,
    firecall.description,
    firecall.name,
    query,
    t,
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
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            mb: 2,
          }}
        >
          <Typography variant="h4">{t('title')}</Typography>
          {showEditButton && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DownloadButton
                onClick={() => downloadDiaries(diaries, t)}
                tooltip={t('downloadCsvTooltip')}
              />
              <Button
                onClick={updateDescription}
                variant="outlined"
                disabled={isQuerying}
              >
                {t('summary')}{' '}
                {isQuerying && <CircularProgress color="primary" size={20} />}
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setTagebuchDialogIsOpen(true)}
              >
                {t('newEntry')}
              </Button>
            </Box>
          )}
        </Box>

        {resultHtml && (
          <Typography>
            <span dangerouslySetInnerHTML={{ __html: resultHtml }}></span>
          </Typography>
        )}

        <Grid container>
          <Grid size={{ xs: 3, md: 2, lg: 1 }}>
            <SortableHeader label={t('col.number')} field="nummer" activeField={sortField} direction={sortDirection} onClick={handleSortClick} />
          </Grid>
          <Grid size={{ xs: 6, md: 5, lg: 2 }}>
            <SortableHeader label={t('col.date')} field="datum" activeField={sortField} direction={sortDirection} onClick={handleSortClick} />
          </Grid>
          <Grid size={{ xs: 12, md: 5, lg: 2 }}>
            <SortableHeader label={t('col.typeFromTo')} field="art" activeField={sortField} direction={sortDirection} onClick={handleSortClick} />
          </Grid>
          <Grid size={{ xs: 12, md: 5, lg: 3 }}>
            <SortableHeader label={t('col.entry')} field="name" activeField={sortField} direction={sortDirection} onClick={handleSortClick} />
          </Grid>
          <Grid size={{ xs: 12, md: 5, lg: 3 }}>
            <SortableHeader label={t('col.description')} field="beschreibung" activeField={sortField} direction={sortDirection} onClick={handleSortClick} />
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
                  {t('now')}
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
                  placeholder={t('placeholder.from')}
                  value={inlineVon}
                  onChange={(e) => setInlineVon(e.target.value)}
                  sx={{ flex: 1, minWidth: 60 }}
                />
                <TextField
                  size="small"
                  placeholder={t('placeholder.to')}
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
                  placeholder={t('placeholder.info')}
                  value={inlineName}
                  onChange={(e) => setInlineName(e.target.value)}
                  fullWidth
                  multiline
                  minRows={1}
                  maxRows={4}
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
                  placeholder={t('placeholder.comment')}
                  value={inlineBeschreibung}
                  onChange={(e) => setInlineBeschreibung(e.target.value)}
                  fullWidth
                  multiline
                  minRows={1}
                  maxRows={4}
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
                <Tooltip title={t('addEntry')}>
                  <span>
                    <IconButton
                      color="primary"
                      onClick={handleInlineAdd}
                      disabled={!inlineName.trim()}
                    >
                      <AddIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Grid>
            </>
          )}

          {sortedDiaries.map((e, index) => (
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
        <>
          <AiAssistantButton
            firecallItems={firecallItems}
            containerSx={{
              position: 'fixed',
              bottom: 80,
              right: 16,
            }}
          />
          <Fab
            color="primary"
            aria-label="add"
            sx={{ position: 'fixed', bottom: 16, right: 16 }}
            onClick={() => setTagebuchDialogIsOpen(true)}
          >
            <AddIcon />
          </Fab>
        </>
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
  const t = useTranslations('tagebuch');

  if (firecallId === 'unknown') {
    return (
      <Typography variant="h4" gutterBottom>
        {t('title')}
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
