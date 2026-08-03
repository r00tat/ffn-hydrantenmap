'use client';

import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import useFahrtenbuchEntries from '../../hooks/useFahrtenbuchEntries';
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
  mergeRowEdits,
  partitionEinsatzRows,
  startCounters,
  type EinsatzRow,
  type EinsatzRowIssue,
} from './einsatzRows';
import { createFahrtenbuchEntries } from './fahrtenbuchActions';
import FahrtenbuchDialog from './FahrtenbuchDialog';

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
  rows: EinsatzRow[];
  isMember: boolean;
  saving: boolean;
  message?: string;
  /** Je übersprungener Zeile eine Zeile Klartext, warum sie nicht ging. */
  messageDetails?: string[];
  messageSeverity?: 'success' | 'warning' | 'error';
  onChangeRow: (key: string, patch: Partial<EinsatzRow>) => void;
  onSave: () => void;
  /** Öffnet die Bearbeitung eines bereits erfassten Eintrags. */
  onEditEntry?: (entry: FahrtenbuchEntry) => void;
}

/**
 * Die reine Darstellung der Sammelerfassung — ohne Firestore, damit sie ohne
 * Emulator testbar bleibt. Die Daten lädt die Default-Komponente unten.
 */
export function EinsatzFahrtenbuchView({
  vehicles,
  rows,
  isMember,
  saving,
  message,
  messageDetails,
  messageSeverity = 'success',
  onChangeRow,
  onSave,
  onEditEntry,
}: EinsatzFahrtenbuchViewProps) {
  const t = useTranslations('fahrtenbuch');

  // Wer nicht in der Gruppe des Einsatzes ist, sieht hier nichts — weder
  // Fahrzeuge noch Namen der Mannschaft.
  if (!isMember) {
    return <Alert severity="info">{t('einsatz.notMember')}</Alert>;
  }
  if (vehicles.length === 0) {
    return <Alert severity="info">{t('einsatz.noGroupVehicles')}</Alert>;
  }
  if (rows.length === 0) {
    return <Alert severity="info">{t('einsatz.noVehicles')}</Alert>;
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

      <Stack spacing={2}>
        {rows.map((row) => {
          const vehicle = vehicles.find((v) => v.id === row.vehicleId);
          const recorded = !!row.existingEntry;

          return (
            <Paper key={row.key} sx={{ p: 2 }} variant="outlined">
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 2 }}
              >
                <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                  {row.vehicleName || row.sourceName}
                </Typography>
                {recorded && (
                  <>
                    <Chip
                      size="small"
                      color="success"
                      label={t('einsatz.alreadyRecorded')}
                    />
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
                )}
              </Stack>

              {!row.vehicleId && (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={t('einsatz.unknownVehicle')}
                  value=""
                  onChange={(e) => {
                    const selected = vehicles.find(
                      (v) => v.id === e.target.value,
                    );
                    onChangeRow(row.key, {
                      vehicleId: selected?.id,
                      vehicleName: selected?.name ?? '',
                      counters: startCounters(selected),
                    });
                  }}
                  sx={{ mb: 2 }}
                >
                  {vehicles.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('driver')}
                    value={row.driverName}
                    disabled={recorded}
                    onChange={(e) =>
                      onChangeRow(row.key, {
                        driverName: e.target.value,
                        driverId: undefined,
                      })
                    }
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label={t('abfahrt')}
                    value={toLocalInput(row.abfahrt)}
                    disabled={recorded}
                    onChange={(e) =>
                      onChangeRow(row.key, {
                        abfahrt: fromLocalInput(e.target.value),
                      })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label={t('ankunft')}
                    value={toLocalInput(row.ankunft)}
                    disabled={recorded}
                    onChange={(e) =>
                      onChangeRow(row.key, {
                        ankunft: fromLocalInput(e.target.value),
                      })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  {/* Die Zählerfelder kommen aus den Definitionen des
                      Fahrzeugs — ein Boot bekommt Betriebsstunden, kein
                      Kilometerfeld. */}
                  <CounterFields
                    definitions={vehicle?.counters ?? []}
                    counters={row.counters}
                    lastCounters={vehicle?.lastCounters ?? {}}
                    disabled={recorded}
                    onChange={(counters) => onChangeRow(row.key, { counters })}
                  />
                </Grid>
              </Grid>
            </Paper>
          );
        })}
      </Stack>

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

  const computedRows = useMemo(
    () =>
      buildEinsatzRows({
        fzgItems: (fzgItems ?? []).map((i) => ({
          id: i.id as string,
          name: i.name,
          alarmierung: i.alarmierung,
          abruecken: i.abruecken,
        })),
        crew: (crew ?? []).map((c) => ({
          recipientId: c.recipientId,
          name: c.name,
          vehicleId: c.vehicleId,
          vehicleName: c.vehicleName,
          funktion: c.funktion,
        })),
        vehicles: activeVehicles,
        persons: activePersons,
        entries,
        firecall: {
          id: firecallId,
          name: firecallName,
          date: firecallDate,
          abruecken: firecallAbruecken,
        },
        now,
      }),
    [
      now,
      fzgItems,
      crew,
      activeVehicles,
      activePersons,
      entries,
      firecallId,
      firecallName,
      firecallDate,
      firecallAbruecken,
    ],
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
    unassigned: EinsatzRow[],
    duplicates: number,
  ) => {
    const parts = [t('einsatz.saved', { count: created })];
    // Übersprungene Zeilen bleiben stehen und werden gemeldet — mit dem
    // tatsächlichen Grund, nicht pauschal als „ohne Endstand".
    if (incomplete.length > 0) {
      parts.push(t('einsatz.skipped', { count: incomplete.length }));
    }
    if (unassigned.length > 0) {
      parts.push(t('einsatz.skippedUnassigned', { count: unassigned.length }));
    }
    if (duplicates > 0) {
      parts.push(t('einsatz.skippedDuplicate', { count: duplicates }));
    }
    const skipped =
      incomplete.length > 0 || unassigned.length > 0 || duplicates > 0;
    setMessageSeverity(skipped ? 'warning' : 'success');
    setMessage(parts.join(' — '));
    setMessageDetails(incomplete.map(issueMessage));
  };

  const save = async () => {
    if (!groupId) return;
    setSaving(true);
    setMessage(undefined);
    setMessageDetails(undefined);

    const { ready, incomplete, unassigned } = partitionEinsatzRows(
      rows,
      activeVehicles,
      firecallName,
    );

    if (ready.length === 0) {
      setSaving(false);
      report(0, incomplete, unassigned, 0);
      return;
    }

    // Kein vehicleName: der Server leitet ihn aus dem geladenen Fahrzeug ab.
    const result = await createFahrtenbuchEntries(
      groupId,
      ready.map((row) => ({
        vehicleId: row.vehicleId as string,
        driverId: row.driverId,
        driverName: row.driverName,
        zweck: 'einsatz' as const,
        firecallId,
        firecallName,
        ziel: firecallName,
        abfahrt: row.abfahrt,
        ankunft: row.ankunft,
        counters: row.counters,
      })),
    );

    setSaving(false);
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
    // Gerät erfasst wurden — das muss sichtbar sein.
    report(
      result.created,
      incomplete,
      unassigned,
      result.skippedVehicleIds.length,
    );
  };

  return (
    <>
      <EinsatzFahrtenbuchView
        groupId={groupId ?? ''}
        vehicles={activeVehicles}
        rows={rows}
        isMember={isMember}
        saving={saving}
        message={message}
        messageDetails={messageDetails}
        messageSeverity={messageSeverity}
        onChangeRow={changeRow}
        onSave={save}
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
