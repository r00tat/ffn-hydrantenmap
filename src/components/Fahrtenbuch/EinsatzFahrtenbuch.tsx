'use client';

import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  arrivalOnDepartureDay,
  requiresDriver,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { estimatedDistance } from '../../common/fahrtenbuchAutoFill';
import useFahrtenbuchEntries from '../../hooks/useFahrtenbuchEntries';
import useFahrtenbuchGroupStandort from '../../hooks/useFahrtenbuchGroupStandort';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFahrtenbuchVehicles from '../../hooks/useFahrtenbuchVehicles';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  type CrewAssignment,
  type Firecall,
  type Fzg,
} from '../firebase/firestore';
import CounterFields from './CounterFields';
import {
  buildEinsatzRows,
  einsatzTimes,
  entryInputsFromRows,
  kmPreview,
  mergeRowEdits,
  partitionEinsatzRows,
  unitsWithoutVehicle,
  type EinsatzAutoFill,
  type EinsatzRow,
  type EinsatzRowIssue,
  type EinsatzTimes,
} from './einsatzRows';
import {
  createFahrtenbuchEntries,
  syncFirecallEntryCount,
} from './fahrtenbuchActions';
import FahrtenbuchDialog from './FahrtenbuchDialog';
import type { EntryFormPerson } from './useEntryFormState';

/** Wandelt einen ISO-Zeitstempel in den Wert für `datetime-local` um. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export interface EinsatzFahrtenbuchViewProps {
  groupId: string;
  vehicles: FahrtenbuchVehicle[];
  /**
   * Die aktiven Personen der Gruppe — Auswahlliste für die Zusatzfahrer.
   * Kommt von außen: Die Ansicht liest nichts selbst aus Firestore.
   */
  persons: EntryFormPerson[];
  rows: EinsatzRow[];
  /** Die Zeile, die gerade gespeichert wird — für den Knopf an ihr. */
  savingKey?: string;
  /** Die Zeiten des Kopfblocks — sie gelten für alle Fahrzeuge. */
  times: EinsatzTimes;
  /**
   * Einheiten des Einsatzes, die nicht in den Fahrtenbuch-Stammdaten stehen und
   * deshalb keine Zeile bekommen. Als Hinweis ausgewiesen, damit ein Fahrzeug,
   * das dort versehentlich fehlt, nicht unbemerkt ohne Fahrt bleibt.
   */
  unitsWithoutVehicle?: string[];
  isMember: boolean;
  saving: boolean;
  message?: string;
  /** Je übersprungener Zeile eine Zeile Klartext, warum sie nicht ging. */
  messageDetails?: string[];
  messageSeverity?: 'success' | 'warning' | 'error';
  /** Was beim Speichern automatisch ergänzt wird — für die Hinweise im Formular. */
  autoFill?: EinsatzAutoFill;
  onChangeTimes: (patch: Partial<EinsatzTimes>) => void;
  onChangeRow: (key: string, patch: Partial<EinsatzRow>) => void;
  onSave: () => void;
  /**
   * Speichert eine einzelne Zeile. Fünf Fahrzeuge auf einmal zu speichern ist
   * der Regelfall, aber wer nur seine eigene Fahrt einträgt, soll nicht die
   * unfertigen Zeilen der anderen mit abschicken müssen.
   */
  onSaveRow?: (key: string) => void;
  /** Öffnet die Bearbeitung eines bereits erfassten Eintrags. */
  onEditEntry?: (entry: FahrtenbuchEntry) => void;
}

/**
 * Die Kilometer-Vorschau als Text. Eine abgeleitete Zahl wird als solche
 * ausgewiesen — im Fahrtenbuch darf eine Schätzung nicht wie eine Ablesung
 * aussehen.
 */
function KmPreviewText({
  vehicle,
  row,
  autoFill,
}: {
  vehicle?: FahrtenbuchVehicle;
  row: EinsatzRow;
  autoFill?: EinsatzAutoFill;
}) {
  const t = useTranslations('fahrtenbuch');
  const preview = kmPreview(vehicle?.counters ?? [], row.counters, autoFill);
  // Kein Kilometerzähler (ein Boot etwa) — die Zähler stehen in den Details.
  if (!preview) return null;

  if (preview.start === undefined || preview.end === undefined) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('einsatz.kmPreviewNoStart')}
      </Typography>
    );
  }

  const diff = preview.end - preview.start;
  return (
    <Typography
      variant="body2"
      color={preview.derived ? 'text.secondary' : 'text.primary'}
    >
      {preview.derived
        ? t('einsatz.kmPreviewEstimated', {
            start: preview.start,
            end: preview.end,
            diff,
          })
        : t('einsatz.kmPreview', {
            start: preview.start,
            end: preview.end,
            diff,
          })}
    </Typography>
  );
}

/**
 * Die reine Darstellung der Sammelerfassung — ohne Firestore, damit sie ohne
 * Emulator testbar bleibt. Die Daten lädt die Default-Komponente unten.
 */
export function EinsatzFahrtenbuchView({
  vehicles,
  persons,
  rows,
  times,
  unitsWithoutVehicle: withoutVehicle,
  isMember,
  saving,
  savingKey,
  message,
  messageDetails,
  messageSeverity = 'success',
  autoFill,
  onChangeTimes,
  onChangeRow,
  onSave,
  onSaveRow,
  onEditEntry,
}: EinsatzFahrtenbuchViewProps) {
  const t = useTranslations('fahrtenbuch');
  // Rein visueller Zustand: welche Zeilen ihre Details zeigen. Gehört in die
  // Ansicht, nicht in die Zeilendaten — ein Firestore-Snapshot darf einen
  // aufgeklappten Bereich nicht zuklappen.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Wer nicht in der Gruppe des Einsatzes ist, sieht hier nichts — weder
  // Fahrzeuge noch Namen der Mannschaft.
  if (!isMember) {
    return <Alert severity="info">{t('einsatz.notMember')}</Alert>;
  }
  if (vehicles.length === 0) {
    return <Alert severity="info">{t('einsatz.noGroupVehicles')}</Alert>;
  }
  const withoutVehicleHint = withoutVehicle?.length ? (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
      {t('einsatz.notInFahrtenbuch', { names: withoutVehicle.join(', ') })}
    </Typography>
  ) : null;

  if (rows.length === 0) {
    return (
      <Box>
        <Alert severity="info">{t('einsatz.noVehicles')}</Alert>
        {withoutVehicleHint}
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('einsatz.description')}
      </Typography>
      {message && (
        <Alert severity={messageSeverity} sx={{ mb: 2 }}>
          {message}
          {messageDetails?.map((detail) => (
            <Typography key={detail} variant="body2">
              {detail}
            </Typography>
          ))}
        </Alert>
      )}

      {/* Ein Zeitpaar für alle Fahrzeuge: Beim Befüllen aus dem Einsatz sind
          die Zeiten fast immer dieselben, und ein Feldpaar je Fahrzeug hieße
          dieselbe Angabe fünfmal zu prüfen. */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {t('einsatz.commonTimes')}
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label={t('abfahrt')}
              value={toLocalInput(times.abfahrt)}
              onChange={(e) => {
                const abfahrt = fromLocalInput(e.target.value);
                // Die Ankunft zieht mit dem Datum mit und behält ihre Uhrzeit —
                // eine Fahrt endet im Normalfall am Tag der Abfahrt.
                onChangeTimes(
                  abfahrt
                    ? {
                        abfahrt,
                        ankunft: arrivalOnDepartureDay(
                          abfahrt,
                          new Date(times.ankunft),
                        ),
                      }
                    : { abfahrt },
                );
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label={t('ankunft')}
              value={toLocalInput(times.ankunft)}
              onChange={(e) =>
                onChangeTimes({ ankunft: fromLocalInput(e.target.value) })
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
        </Grid>
        <FormHelperText>{t('einsatz.commonTimesHint')}</FormHelperText>
      </Paper>

      <Stack spacing={1}>
        {rows.map((row) => {
          const vehicle = vehicles.find((v) => v.id === row.vehicleId);
          const recorded = !!row.existingEntry;
          const isOpen = !!expanded[row.key];
          // Ein Wechselladeaufbau oder Anhänger hat keinen eigenen Fahrer. Das
          // Feld stünde bei ihm dauerhaft leer da und wäre auch nicht zu
          // füllen — die Mannschaftszuordnung kennt für ihn keinen Maschinisten.
          const needsDriver = requiresDriver(vehicle?.counters ?? []);

          return (
            <Paper key={row.key} sx={{ px: 2, py: 1.5 }} variant="outlined">
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                {/* Der Name aus den Stammdaten: Unter ihm entsteht der Eintrag,
                    und die Zeile steht nur da, weil der Name des Einsatzes ihn
                    getroffen hat. Schreibweisen wie „RLFA-3000/100" auf der
                    Karte sollen nicht neben „RLFA 3000/100" im Fahrtenbuch
                    stehen. */}
                <Typography
                  variant="subtitle2"
                  sx={{ minWidth: 110, flexShrink: 0 }}
                >
                  {row.vehicleName || row.sourceName}
                </Typography>

                {recorded ? (
                  <>
                    <Chip
                      size="small"
                      color="success"
                      label={t('einsatz.alreadyRecorded')}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <Tooltip title={t('editEntry')}>
                      <IconButton
                        size="small"
                        aria-label={t('editEntry')}
                        onClick={() =>
                          row.existingEntry && onEditEntry?.(row.existingEntry)
                        }
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    {needsDriver ? (
                      <>
                        {/* Autocomplete über die Personen der Gruppe, wie im
                            Dialog: Der vorbelegte Maschinist kommt als Person
                            aus der internen Liste („Vorname Nachname"), und
                            eine freie Eingabe bleibt möglich — das Fahrtenbuch
                            erlaubt Fahrer ohne Personendatensatz. Die
                            Personen-ID wird immer zusammen mit dem Namen
                            gesetzt, sonst zeigte sie nach einer freien Eingabe
                            noch auf die vorige Person. */}
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={persons.map((p) => p.name)}
                          value={row.driverName}
                          sx={{ flexGrow: 1, minWidth: 160 }}
                          onInputChange={(_, value) =>
                            onChangeRow(row.key, {
                              driverName: value,
                              driverId: persons.find((p) => p.name === value)
                                ?.id,
                            })
                          }
                          renderInput={(params) => (
                            <TextField {...params} label={t('driver')} />
                          )}
                        />
                        {/* Nichts vorbelegt: Die gemeldete Mannschaft eines
                            Fahrzeugs ist nicht seine Fahrerliste. */}
                        <Autocomplete
                          multiple
                          freeSolo
                          size="small"
                          options={persons.map((p) => p.name)}
                          value={(row.coDrivers ?? []).map((ref) => ref.name)}
                          sx={{ flexGrow: 1, minWidth: 200 }}
                          onChange={(_, values) =>
                            onChangeRow(row.key, {
                              coDrivers: values.map((name) => {
                                const person = persons.find(
                                  (p) => p.name === name,
                                );
                                return person?.id
                                  ? { id: person.id, name: person.name }
                                  : { name };
                              }),
                            })
                          }
                          renderInput={(params) => (
                            <TextField {...params} label={t('coDrivers')} />
                          )}
                        />
                      </>
                    ) : (
                      <Box sx={{ flexGrow: 1 }} />
                    )}
                    <KmPreviewText
                      vehicle={vehicle}
                      row={row}
                      autoFill={autoFill}
                    />
                    {onSaveRow && (
                      <Tooltip title={t('einsatz.saveRow')}>
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            aria-label={t('einsatz.saveRow')}
                            disabled={saving}
                            onClick={() => onSaveRow(row.key)}
                          >
                            {savingKey === row.key ? (
                              <CircularProgress size={20} />
                            ) : (
                              <SaveIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title={t('einsatz.editDetails')}>
                      <IconButton
                        size="small"
                        aria-label={t('einsatz.editDetails')}
                        aria-expanded={isOpen}
                        onClick={() =>
                          setExpanded((current) => ({
                            ...current,
                            [row.key]: !current[row.key],
                          }))
                        }
                      >
                        <ExpandMoreIcon
                          fontSize="small"
                          sx={{
                            transform: isOpen ? 'rotate(180deg)' : undefined,
                            transition: 'transform 150ms',
                          }}
                        />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Stack>


              <Collapse in={isOpen && !recorded} unmountOnExit>
                <Box sx={{ mt: 2 }}>
                  <Grid container spacing={2} sx={{ mb: 1 }}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="datetime-local"
                        label={t('abfahrt')}
                        value={toLocalInput(row.abfahrt)}
                        onChange={(e) => {
                          const abfahrt = fromLocalInput(e.target.value);
                          onChangeRow(
                            row.key,
                            abfahrt
                              ? {
                                  abfahrt,
                                  ankunft: arrivalOnDepartureDay(
                                    abfahrt,
                                    new Date(row.ankunft),
                                  ),
                                }
                              : { abfahrt },
                          );
                        }}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="datetime-local"
                        label={t('ankunft')}
                        value={toLocalInput(row.ankunft)}
                        onChange={(e) =>
                          onChangeRow(row.key, {
                            ankunft: fromLocalInput(e.target.value),
                          })
                        }
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Grid>
                  </Grid>
                  {/* Die Zählerfelder kommen aus den Definitionen des
                      Fahrzeugs — ein Boot bekommt Betriebsstunden, kein
                      Kilometerfeld. */}
                  <CounterFields
                    definitions={vehicle?.counters ?? []}
                    counters={row.counters}
                    lastCounters={vehicle?.lastCounters ?? {}}
                    autoFill={autoFill}
                    onChange={(counters) => onChangeRow(row.key, { counters })}
                  />
                </Box>
              </Collapse>
            </Paper>
          );
        })}
      </Stack>

      {withoutVehicleHint}

      <Tooltip title={t('einsatz.saveAll')}>
        <span>
          <Button
            variant="contained"
            sx={{ mt: 2 }}
            onClick={onSave}
            disabled={saving}
          >
            {t('einsatz.saveAll')}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}

export interface EinsatzFahrtenbuchProps {
  firecallId: string;
  firecall?: Firecall;
}

/** Fahrzeuge der Karte; gelöschte Items bleiben in Firestore stehen. */
const isActiveVehicleItem = (item: Fzg) =>
  item?.type === 'vehicle' && item?.deleted !== true;

/** Fehlerschlüssel, die die Server Action unverändert zurückgibt. */
const TRANSLATED_SAVE_ERRORS = [
  'notAllowed',
  'notInGroup',
  'notLoggedIn',
  'entryDeleted',
  'tooManyEntries',
] as const;

export default function EinsatzFahrtenbuch({
  firecallId,
  firecall,
}: EinsatzFahrtenbuchProps) {
  const t = useTranslations('fahrtenbuch');
  const { groups } = useFirebaseLogin();
  const groupId = firecall?.group;
  const isMember = !!groupId && !!groups?.includes(groupId);
  const memberGroupId = isMember ? groupId : undefined;

  const { activeVehicles } = useFahrtenbuchVehicles(memberGroupId);
  const { activePersons } = useFahrtenbuchPersons(memberGroupId);
  // Gezielt die Fahrten dieses Einsatzes: ein Fenster der jüngsten Fahrten
  // enthielte einen älteren Einsatz nicht mehr, und die Zeilen sähen dann
  // unerfasst aus, obwohl es die Einträge längst gibt.
  const entries = useFahrtenbuchEntries(memberGroupId, { firecallId });
  const { standort } = useFahrtenbuchGroupStandort(memberGroupId);

  // Zieht den Fahrtenzähler am Einsatz nach, damit die Einsatz-Übersicht
  // erfasste Fahrten auch bei Einsätzen aus der Zeit vor dem Zähler anzeigt.
  // Hier, weil die Fahrten dieses Einsatzes ohnehin geladen sind; gezählt wird
  // serverseitig aus dem Bestand, die Zahl hier ist nur der Anlass. Einmal je
  // Einsatz, sonst schriebe jeder Snapshot erneut.
  const syncedFirecallRef = useRef<string | undefined>(undefined);
  const knownEntryCount = firecall?.fahrtenbuchEntryCount;
  useEffect(() => {
    if (!memberGroupId) return;
    if (knownEntryCount === entries.length) return;
    if (syncedFirecallRef.current === firecallId) return;
    syncedFirecallRef.current = firecallId;
    syncFirecallEntryCount(memberGroupId, firecallId);
  }, [memberGroupId, firecallId, knownEntryCount, entries.length]);

  const fzgItems = useFirebaseCollection<Fzg>({
    collectionName: memberGroupId ? FIRECALL_COLLECTION_ID : '',
    pathSegments: [firecallId, FIRECALL_ITEMS_COLLECTION_ID],
    filterFn: isActiveVehicleItem,
  });
  const crew = useFirebaseCollection<CrewAssignment>({
    collectionName: memberGroupId ? FIRECALL_COLLECTION_ID : '',
    pathSegments: [firecallId, FIRECALL_CREW_COLLECTION_ID],
  });

  // Einmal pro Mount: sonst wechselte die Vorbelegung bei jeder Neuberechnung
  // und würde damit auch die Eingaben des Benutzers verwerfen.
  const [now] = useState(() => new Date().toISOString());
  const firecallName = firecall?.name ?? '';
  const firecallDate = firecall?.date;
  const firecallAbruecken = firecall?.abruecken;
  const firecallLat = firecall?.lat;
  const firecallLng = firecall?.lng;

  // Nur eine Größenordnung: Gespeichert wird immer die echte Routendistanz,
  // die die Server Action beim Speichern holt. Hier ginge dafür ein
  // API-Aufruf je geöffneter Einsatzseite drauf — die meisten davon, ohne dass
  // jemand das Fahrtenbuch befüllt.
  const autoFill = useMemo<EinsatzAutoFill>(
    () =>
      typeof firecallLat === 'number' && typeof firecallLng === 'number'
        ? {
            distance: estimatedDistance(standort, {
              lat: firecallLat,
              lng: firecallLng,
            }),
          }
        : {},
    [standort, firecallLat, firecallLng],
  );

  const items = useMemo(
    () =>
      (fzgItems ?? []).map((i) => ({
        id: i.id as string,
        name: i.name,
        alarmierung: i.alarmierung,
        abruecken: i.abruecken,
      })),
    [fzgItems],
  );

  const firecallSource = useMemo(
    () => ({
      id: firecallId,
      name: firecallName,
      date: firecallDate,
      abruecken: firecallAbruecken,
    }),
    [firecallId, firecallName, firecallDate, firecallAbruecken],
  );

  // Die gemeinsamen Zeiten liegen als Änderungen über den berechneten Werten —
  // nicht als `useState`, das mit ihnen vorbelegt wird. Die Einsatzdaten kommen
  // aus einem Firestore-Snapshot und sind beim ersten Rendern noch nicht da; ein
  // vorbelegter Zustand behielte für immer den Platzhalter.
  const computedTimes = useMemo(
    () => einsatzTimes(items, firecallSource, now),
    [items, firecallSource, now],
  );
  const [timeEdits, setTimeEdits] = useState<Partial<EinsatzTimes>>({});
  const times = useMemo<EinsatzTimes>(
    () => ({
      abfahrt: timeEdits.abfahrt ?? computedTimes.abfahrt,
      ankunft: timeEdits.ankunft ?? computedTimes.ankunft,
    }),
    [timeEdits, computedTimes],
  );

  const crewMembers = useMemo(
    () =>
      (crew ?? []).map((c) => ({
        recipientId: c.recipientId,
        name: c.name,
        vehicleId: c.vehicleId,
        vehicleName: c.vehicleName,
        funktion: c.funktion,
      })),
    [crew],
  );

  const computedRows = useMemo(
    () =>
      buildEinsatzRows(
        {
          fzgItems: items,
          crew: crewMembers,
          vehicles: activeVehicles,
          persons: activePersons,
          entries,
          firecall: firecallSource,
        },
        times,
      ),
    [
      items,
      crewMembers,
      activeVehicles,
      activePersons,
      entries,
      firecallSource,
      times,
    ],
  );

  // Die Einheiten, für die es kein Fahrzeug in den Stammdaten gibt. Sie
  // bekommen keine Zeile — der Hinweis hält fest, dass für sie bewusst nichts
  // erfasst wird.
  const withoutVehicle = useMemo(
    () =>
      unitsWithoutVehicle({
        fzgItems: items,
        crew: crewMembers,
        vehicles: activeVehicles,
      }),
    [items, crewMembers, activeVehicles],
  );

  // Kein useEffect zum Übernehmen der berechneten Zeilen: die Eingaben liegen
  // als Änderungen je Zeile vor und werden beim Rendern über die frisch
  // berechneten Zeilen gelegt. So überlebt getippter Text jeden neuen
  // Firestore-Snapshot — auch den nach dem Speichern, der die Zähler-Caches
  // der Fahrzeuge neu schreibt.
  const [edits, setEdits] = useState<Record<string, Partial<EinsatzRow>>>({});
  const rows = useMemo(
    () => mergeRowEdits(computedRows, edits, entries, firecallId),
    [computedRows, edits, entries, firecallId],
  );

  const [saving, setSaving] = useState(false);
  // Welche Zeile gerade gespeichert wird — nur für den Spinner an ihrem Knopf.
  // `saving` sperrt weiter alle Knöpfe: Es läuft eine Anfrage, nicht mehrere.
  const [savingKey, setSavingKey] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [messageDetails, setMessageDetails] = useState<string[]>();
  const [messageSeverity, setMessageSeverity] = useState<
    'success' | 'warning' | 'error'
  >('success');
  const [editEntry, setEditEntry] = useState<FahrtenbuchEntry>();

  const changeRow = (key: string, patch: Partial<EinsatzRow>) =>
    setEdits((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));

  /** Der Name eines Zählers für die Fehlermeldung. */
  const counterLabel = (vehicleId: string | undefined, counterId: string) => {
    const def = activeVehicles
      .find((v) => v.id === vehicleId)
      ?.counters.find((d) => d.id === counterId);
    if (!def) return counterId;
    return def.labelKey ? t(def.labelKey as 'counters.km') : def.label;
  };

  const issueMessage = (issue: EinsatzRowIssue) => {
    const reasons = issue.errors.map((error) => {
      const [key, counterId] = error.split(':');
      return counterId
        ? t(`errors.${key}` as 'errors.counterMissing', {
            counter: counterLabel(issue.row.vehicleId, counterId),
          })
        : t(`errors.${key}` as 'errors.vehicleMissing');
    });
    const name = issue.row.vehicleName || issue.row.sourceName;
    return `${name}: ${reasons.join(' ')}`;
  };

  const report = (
    created: number,
    incomplete: EinsatzRowIssue[],
    duplicates: number,
    failed: number,
    roundTripKm?: number,
    distanceSource?: 'route' | 'estimate',
  ) => {
    const parts = [t('einsatz.saved', { count: created })];
    // Die tatsächlich eingetragene Strecke gehört in die Meldung: Im Formular
    // stand nur eine Schätzung. Ob sie gefahren oder geschätzt ist, muss dabei
    // stehen — eine geschätzte Strecke gehört im Fahrtenbuch nachgesehen.
    if (created > 0 && roundTripKm !== undefined) {
      parts.push(
        distanceSource === 'estimate'
          ? t('einsatz.savedKmEstimated', { km: roundTripKm })
          : t('einsatz.savedKm', { km: roundTripKm }),
      );
    }
    // Übersprungene Zeilen bleiben stehen und werden gemeldet — mit dem
    // tatsächlichen Grund, nicht pauschal als „ohne Endstand".
    if (incomplete.length > 0) {
      parts.push(t('einsatz.skipped', { count: incomplete.length }));
    }
    if (duplicates > 0) {
      parts.push(t('einsatz.skippedDuplicate', { count: duplicates }));
    }
    // Streng von den Duplikaten getrennt: Diese Fahrten fehlen im Fahrtenbuch.
    // Sie als „schon erfasst" zu melden wäre die einzige unwahre Rückmeldung
    // der Sammelerfassung — und die Fahrt bliebe unbemerkt aus.
    if (failed > 0) {
      parts.push(t('einsatz.failed', { count: failed }));
    }
    const skipped = incomplete.length > 0 || duplicates > 0 || failed > 0;
    setMessageSeverity(skipped ? 'warning' : 'success');
    setMessage(parts.join(' — '));
    setMessageDetails(incomplete.map(issueMessage));
  };

  /**
   * Speichert die Zeilen — alle, oder mit `keys` nur die genannten.
   *
   * Eine einzelne Zeile geht durch denselben Pfad wie „Alle speichern":
   * Partitionierung, Server Action, dieselbe Meldung. Ein zweiter Pfad würde
   * bei der Duplikatserkennung oder der Kilometerlogik auseinanderlaufen.
   */
  const save = async (keys?: string[]) => {
    if (!groupId) return;
    setSaving(true);
    setSavingKey(keys?.length === 1 ? keys[0] : undefined);
    setMessage(undefined);
    setMessageDetails(undefined);

    const selected = keys
      ? rows.filter((row) => keys.includes(row.key))
      : rows;
    const { ready, incomplete } = partitionEinsatzRows(
      selected,
      activeVehicles,
      firecallName,
      autoFill,
      firecallId,
    );

    if (ready.length === 0) {
      setSaving(false);
      setSavingKey(undefined);
      report(0, incomplete, 0, 0);
      return;
    }

    const result = await createFahrtenbuchEntries(
      groupId,
      entryInputsFromRows(ready, { firecallId, firecallName }),
    );

    setSaving(false);
    setSavingKey(undefined);
    if (!result.success) {
      const known = TRANSLATED_SAVE_ERRORS.find((key) => key === result.error);
      setMessageSeverity('error');
      setMessage(
        known
          ? t(`errors.${known}` as 'errors.notInGroup')
          : t('errors.saveFailed', { message: result.error ?? '' }),
      );
      return;
    }
    // Der Server überspringt Fahrzeuge, die inzwischen von einem anderen
    // Gerät erfasst wurden, und meldet getrennt davon die Zeilen, die er nicht
    // schreiben konnte — beides muss sichtbar sein.
    report(
      result.created,
      incomplete,
      result.skippedVehicleIds.length,
      result.failedVehicleIds.length,
      result.roundTripKm,
      result.distanceSource,
    );
  };

  return (
    <>
      <EinsatzFahrtenbuchView
        groupId={groupId ?? ''}
        vehicles={activeVehicles}
        persons={activePersons}
        rows={rows}
        times={times}
        unitsWithoutVehicle={withoutVehicle}
        isMember={isMember}
        saving={saving}
        savingKey={savingKey}
        message={message}
        messageDetails={messageDetails}
        messageSeverity={messageSeverity}
        autoFill={autoFill}
        onChangeTimes={(patch) =>
          setTimeEdits((current) => ({ ...current, ...patch }))
        }
        onChangeRow={changeRow}
        onSave={() => save()}
        onSaveRow={(key) => save([key])}
        onEditEntry={setEditEntry}
      />
      {/* Bedingt gemountet: der Dialog liest seinen Anfangszustand nur beim
          Mounten. */}
      {editEntry && groupId && (
        <FahrtenbuchDialog
          key={editEntry.id}
          open
          groupId={groupId}
          vehicles={activeVehicles}
          persons={activePersons}
          firecalls={[
            {
              id: firecallId,
              name: firecallName,
              date: firecallDate,
              abruecken: firecallAbruecken,
            },
          ]}
          entries={entries}
          entry={editEntry}
          onClose={() => setEditEntry(undefined)}
        />
      )}
    </>
  );
}
