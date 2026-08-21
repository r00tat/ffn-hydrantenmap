'use client';

import { useTranslations } from 'next-intl';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Autocomplete,
  Box,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { BlaulichtSmsAlarm } from '../../app/blaulicht-sms/actions';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
import {
  normalizePersonName,
  personDisplayName,
} from '../../common/fahrtenbuch';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useCrewAssignments, {
  BlaulichtSmsRecipient,
} from '../../hooks/useCrewAssignments';
import { useFirecall } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import useVehicles from '../../hooks/useVehicles';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import {
  CrewAssignment,
  CrewFunktion,
  CREW_FUNKTIONEN,
  Fzg,
  funktionAbkuerzung,
} from '../firebase/firestore';
import VehicleQuickAddChips from '../FirecallItems/VehicleQuickAddChips';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import CrewVehicleColumn from './CrewVehicleColumn';

export interface CrewAssignmentBoardProps {
  alarms?: BlaulichtSmsAlarm[] | null;
}

/* ─── Mobile: compact table components ─── */

function DroppableTableBody({
  droppableId,
  children,
}: {
  droppableId: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });
  return (
    <TableBody
      ref={setNodeRef}
      sx={{ backgroundColor: isOver ? 'action.hover' : undefined }}
    >
      {children}
    </TableBody>
  );
}

function CrewRow({
  assignment,
  vehicles,
  onFunktionChange,
  onVehicleChange,
  onRemove,
  readOnly = false,
}: {
  assignment: CrewAssignment;
  vehicles: Fzg[];
  onFunktionChange: (funktion: CrewFunktion) => void;
  onVehicleChange: (vehicleId: string | null, vehicleName: string) => void;
  onRemove?: () => void;
  /** Nur-Lese-Ansicht für Einsatz-Gäste ohne Schreibrecht. */
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: assignment.id || assignment.recipientId,
      disabled: readOnly,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
        position: 'relative' as const,
      }
    : undefined;

  const handleFunktionChange = (event: SelectChangeEvent) => {
    onFunktionChange(event.target.value as CrewFunktion);
  };

  const handleVehicleChange = (event: SelectChangeEvent) => {
    const value = event.target.value;
    if (value === '') {
      onVehicleChange(null, '');
    } else {
      const vehicle = vehicles.find((v) => v.id === value);
      onVehicleChange(value, vehicle?.name || '');
    }
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      sx={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <TableCell sx={{ width: 32, p: 0.5 }}>
        {!readOnly && (
          <DragIndicatorIcon
            {...listeners}
            {...attributes}
            fontSize="small"
            sx={{ cursor: 'grab', color: 'action.active', touchAction: 'none' }}
          />
        )}
      </TableCell>
      <TableCell sx={{ p: 0.5 }}>
        <Typography variant="body2" noWrap>
          {assignment.name}
        </Typography>
      </TableCell>
      <TableCell sx={{ p: 0.5 }}>
        <FormControl size="small" fullWidth>
          <Select
            value={assignment.funktion}
            onChange={handleFunktionChange}
            size="small"
            variant="standard"
            sx={{ fontSize: '0.875rem' }}
            readOnly={readOnly}
          >
            {CREW_FUNKTIONEN.map((f) => (
              <MenuItem key={f} value={f}>
                {funktionAbkuerzung(f)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>
      <TableCell sx={{ p: 0.5 }}>
        <FormControl size="small" fullWidth>
          <Select
            value={assignment.vehicleId || ''}
            onChange={handleVehicleChange}
            size="small"
            variant="standard"
            displayEmpty
            sx={{ fontSize: '0.875rem' }}
            readOnly={readOnly}
          >
            <MenuItem value="">—</MenuItem>
            {vehicles.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>
      {!readOnly && onRemove && (
        <TableCell sx={{ width: 32, p: 0.5 }}>
          <IconButton size="small" onClick={onRemove} color="error">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </TableCell>
      )}
    </TableRow>
  );
}

/* ─── Main component ─── */

// A crew entry counts as manually added when its source is 'manual' OR — for
// legacy entries created before the `source` field existed — when its
// recipientId carries the historical `manual-` prefix. Such entries must stay
// visible and removable even while an alarm is loaded.
/**
 * Ein Eintrag der Auswahl „Weitere Person hinzufügen".
 *
 * Zwei Quellen: die Empfänger der Alarme, die nicht zugesagt haben, und die
 * Personenliste des Fahrtenbuchs. Letztere ist der Grund, dass die Auswahl auch
 * bei einem Einsatz ohne Alarm — oder für jemanden, der gar kein BlaulichtSMS
 * hat — Namen anbietet.
 */
interface CrewPersonOption {
  key: string;
  name: string;
  /** Nur bei einem Alarm-Empfänger; die Personenliste hat keine Empfänger-ID. */
  recipient?: BlaulichtSmsRecipient;
}

const isManualEntry = (a: CrewAssignment) =>
  a.source === 'manual' ||
  (a.source === undefined && a.recipientId.startsWith('manual-'));

export default function CrewAssignmentBoard({
  alarms,
}: CrewAssignmentBoardProps) {
  const t = useTranslations('crew');
  const {
    crewAssignments,
    syncFromAlarms,
    addManualPerson,
    addPersonFromRecipient,
    assignVehicle,
    updateFunktion,
    removeAssignment,
  } = useCrewAssignments();
  const [newPersonName, setNewPersonName] = useState('');
  const [vehicleToRemove, setVehicleToRemove] = useState<Fzg | undefined>();
  const canWrite = useFirecallWriteAccess();
  const { vehicles } = useVehicles();
  const { vehicles: kostenersatzVehicles } = useKostenersatzVehicles();
  const firecall = useFirecall();
  // Die Personenliste der Gruppe des Einsatzes: Auswahlquelle beim Hinzufügen
  // und Maßstab für die angezeigte Schreibweise der Namen.
  const { activePersons } = useFahrtenbuchPersons(firecall?.group);
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const existingVehicleNames = useMemo(
    () => vehicles.map((v) => v.name),
    [vehicles],
  );

  // Recipients across all alarms who did NOT confirm (no / unknown / pending),
  // deduped by id, excluding anyone already in the crew list — dazu die
  // Personenliste des Fahrtenbuchs.
  const additionalPersonOptions = useMemo<CrewPersonOption[]>(() => {
    const alreadyAdded = new Set(crewAssignments.map((a) => a.recipientId));
    // Über `normalizePersonName`, nicht über den rohen Namen: Aus BlaulichtSMS
    // kommt „Nachname Vorname", die Personenliste führt „Vorname Nachname" —
    // ohne das stünde derselbe Mensch zweimal in der Auswahl.
    const takenNames = new Set(
      crewAssignments.map((a) => normalizePersonName(a.name)),
    );
    const options: CrewPersonOption[] = [];

    const byId = new Map<string, BlaulichtSmsRecipient>();
    for (const alarm of alarms ?? []) {
      for (const r of alarm.recipients) {
        if (r.participation === 'yes') continue;
        if (alreadyAdded.has(r.id)) continue;
        if (!byId.has(r.id)) {
          byId.set(r.id, {
            id: r.id,
            name: r.name,
            participation: r.participation,
          });
        }
      }
    }
    for (const recipient of byId.values()) {
      options.push({
        key: `recipient:${recipient.id}`,
        name: recipient.name,
        recipient,
      });
      takenNames.add(normalizePersonName(recipient.name));
    }

    // Der Alarm-Empfänger hat Vorrang: Über ihn ist die Person eindeutig
    // identifiziert, über den Namen nur wahrscheinlich.
    for (const person of activePersons) {
      const normalized = normalizePersonName(person.name);
      if (!normalized || takenNames.has(normalized)) continue;
      takenNames.add(normalized);
      options.push({ key: `person:${person.id}`, name: person.name });
    }
    return options;
  }, [alarms, crewAssignments, activePersons]);

  const participationLabel = useCallback(
    (participation: BlaulichtSmsRecipient['participation']) => {
      switch (participation) {
        case 'no':
          return t('statusDeclined');
        case 'pending':
          return t('statusPending');
        default:
          return t('statusNoAnswer');
      }
    },
    [t],
  );

  // Ein Eintrag entsteht über die Melder-ID, wenn es eine gibt — daran erkennt
  // `syncFromAlarms` die Person wieder, sobald sie im BlaulichtSMS-Alarm doch
  // noch zusagt. Aus der Personenliste gibt es keine; der Eintrag entsteht dann
  // wie eine Eingabe von Hand, aber mit der gepflegten Schreibweise, an der
  // `resolveDriver` ihn über den Namensvergleich wiederfindet.
  const addFromOption = useCallback(
    (option: CrewPersonOption) => {
      if (option.recipient) addPersonFromRecipient(option.recipient);
      else addManualPerson(option.name);
    },
    [addManualPerson, addPersonFromRecipient],
  );

  // Die Autocomplete liefert bei Auswahl aus der Liste das Options-Objekt, bei
  // Enter auf frei getippten Text (freeSolo) nur den String. Beides läuft
  // bewusst durch dieselbe Stelle statt über einen eigenen Enter-Handler am
  // Eingabefeld: Ein solcher Handler lief zusätzlich zur Auswahl von MUI und
  // legte den halb getippten Namen als zweite, manuelle Person an.
  //
  // Ein getippter Name, der eine angebotene Person trifft, wird über diese
  // angelegt statt aus dem Text — sonst fehlte die Melder-ID bzw. die
  // gepflegte Schreibweise. Verglichen wird über `normalizePersonName`, damit
  // „Berger Anna" auch „Anna Berger" trifft.
  const handleAddPerson = useCallback(
    (value: CrewPersonOption | string | null) => {
      if (!value) return;
      if (typeof value !== 'string') {
        addFromOption(value);
        setNewPersonName('');
        return;
      }
      const name = value.trim();
      if (!name) return;
      const normalized = normalizePersonName(name);
      const option = additionalPersonOptions.find(
        (o) => normalizePersonName(o.name) === normalized,
      );
      if (option) addFromOption(option);
      else addManualPerson(name);
      setNewPersonName('');
    },
    [addFromOption, addManualPerson, additionalPersonOptions],
  );

  const handleAddVehicle = useCallback(
    (vehicleName: string) => {
      // Dieselbe Quelle wie die Chip-Leiste: Käme die Liste hier weiterhin aus
      // `DEFAULT_VEHICLES`, legte ein Chip mit einem dort unbekannten Namen —
      // etwa „Mehrzweckboot" — gar kein Item an.
      const vehicle = kostenersatzVehicles.find((v) => v.name === vehicleName);
      if (!vehicle) return;
      addFirecallItem({
        type: 'vehicle',
        name: vehicle.name,
        fw: 'Neusiedl am See',
        datum: new Date().toISOString(),
        lat: firecall?.lat ?? 0,
        lng: firecall?.lng ?? 0,
      } as Fzg);
    },
    [addFirecallItem, firecall, kostenersatzVehicles],
  );

  const crewOnVehicleToRemove = useMemo(
    () =>
      vehicleToRemove?.id
        ? crewAssignments.filter((a) => a.vehicleId === vehicleToRemove.id)
            .length
        : 0,
    [crewAssignments, vehicleToRemove],
  );

  const handleRemoveVehicleRequest = useCallback(
    (vehicleId: string) => {
      setVehicleToRemove(vehicles.find((v) => v.id === vehicleId));
    },
    [vehicles],
  );

  const handleRemoveVehicleByName = useCallback(
    (vehicleName: string) => {
      setVehicleToRemove(vehicles.find((v) => v.name === vehicleName));
    },
    [vehicles],
  );

  // Das Fahrzeug verlässt den Einsatz, die Besatzung bleibt: alle Zuordnungen
  // fallen auf „Verfügbar" zurück, damit niemand mit dem Fahrzeug verschwindet.
  // Bewusst über alle `crewAssignments` statt nur die sichtbaren — sonst bliebe
  // an ausgeblendeten Einträgen eine tote vehicleId hängen.
  const handleRemoveVehicleConfirmed = useCallback(async () => {
    const vehicle = vehicleToRemove;
    setVehicleToRemove(undefined);
    if (!vehicle?.id) return;
    await Promise.all(
      crewAssignments
        .filter((a) => a.vehicleId === vehicle.id && a.id)
        .map((a) => assignVehicle(a.id!, null, '')),
    );
    await updateFirecallItem({ ...vehicle, deleted: true });
  }, [assignVehicle, crewAssignments, updateFirecallItem, vehicleToRemove]);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Only sync once per alarm-set to prevent duplicate creation.
  // The key is a stable join of all alarm ids so that adding/removing an
  // alarm re-triggers the sync.
  const alarmKey = useMemo(
    () =>
      (alarms ?? [])
        .map((a) => a.alarmId)
        .sort()
        .join(','),
    [alarms],
  );
  const syncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!alarms || alarms.length === 0) return;
    if (syncedKeyRef.current === alarmKey) return;
    syncedKeyRef.current = alarmKey;
    syncFromAlarms(alarms);
  }, [alarms, alarmKey, syncFromAlarms]);

  // Union of confirmed (yes) recipient ids across ALL alarms.
  // null when no alarms are available → then all crew entries are shown.
  const confirmedIds = useMemo(() => {
    if (!alarms || alarms.length === 0) return null;
    const ids = new Set<string>();
    for (const alarm of alarms) {
      for (const r of alarm.recipients) {
        if (r.participation === 'yes') ids.add(r.id);
      }
    }
    return ids;
  }, [alarms]);

  // Show an entry when it was explicitly added (source 'manual') OR when its
  // recipient is currently in the union of confirmed ids. Legacy entries
  // without a source are treated as 'alarm'. Dedupe by recipientId.
  const validAssignments = useMemo(() => {
    const seen = new Set<string>();
    return crewAssignments.filter((a) => {
      const isManual = isManualEntry(a);
      if (!isManual && confirmedIds && !confirmedIds.has(a.recipientId))
        return false;
      if (seen.has(a.recipientId)) return false;
      seen.add(a.recipientId);
      return true;
    });
  }, [crewAssignments, confirmedIds]);

  /**
   * Dieselben Einträge, aber mit dem Namen in der Schreibweise der
   * Personenliste („Vorname Nachname"). Aus BlaulichtSMS kommt „Nachname
   * Vorname"; dieselbe Person soll in der Anwendung nicht in zwei Varianten
   * auftauchen.
   *
   * Nur die Anzeige: In Firestore bleibt der gemeldete Name stehen, und alle
   * Schreibvorgänge gehen weiterhin über `id`/`recipientId`. Ein Name ohne
   * eindeutigen Treffer in der Personenliste bleibt unverändert — geraten wird
   * nicht.
   */
  const displayAssignments = useMemo(
    () =>
      validAssignments.map((a) => ({
        ...a,
        name: personDisplayName(a.name, activePersons),
      })),
    [validAssignments, activePersons],
  );

  const unassigned = displayAssignments.filter((a) => a.vehicleId === null);
  const assignedToVehicle = useCallback(
    (vehicleId: string) =>
      displayAssignments.filter((a) => a.vehicleId === vehicleId),
    [displayAssignments],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const assignmentId = active.id as string;
      const targetVehicleId =
        over.id === 'unassigned' ? null : (over.id as string);
      const targetVehicleName = targetVehicleId
        ? vehicles.find((v) => v.id === targetVehicleId)?.name || ''
        : '';

      assignVehicle(assignmentId, targetVehicleId, targetVehicleName);
    },
    [assignVehicle, vehicles],
  );

  const handleFunktionChange = useCallback(
    (assignmentId: string, funktion: CrewFunktion) => {
      updateFunktion(assignmentId, funktion);
    },
    [updateFunktion],
  );

  const handleVehicleChange = useCallback(
    (
      assignmentId: string,
      vehicleId: string | null,
      vehicleName: string,
    ) => {
      assignVehicle(assignmentId, vehicleId, vehicleName);
    },
    [assignVehicle],
  );

  const renderRows = (assignments: CrewAssignment[]) =>
    assignments.map((a) => (
      <CrewRow
        key={a.id || a.recipientId}
        assignment={a}
        vehicles={vehicles}
        onFunktionChange={(funktion) =>
          handleFunktionChange(a.id || a.recipientId, funktion)
        }
        onVehicleChange={(vId, vName) =>
          handleVehicleChange(a.id || a.recipientId, vId, vName)
        }
        onRemove={
          isManualEntry(a) && a.id
            ? () => removeAssignment(a.id!)
            : undefined
        }
        readOnly={!canWrite}
      />
    ));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h5">{t('title')}</Typography>
        {canWrite && (
        <Autocomplete
          freeSolo
          size="small"
          sx={{ ml: 'auto', minWidth: 260 }}
          options={additionalPersonOptions}
          getOptionLabel={(option) =>
            typeof option === 'string' ? option : option.name
          }
          renderOption={(props, option) => (
            <li {...props} key={option.key}>
              {option.name} (
              {option.recipient
                ? participationLabel(option.recipient.participation)
                : t('fromPersonList')}
              )
            </li>
          )}
          value={null}
          inputValue={newPersonName}
          onInputChange={(_e, value) => setNewPersonName(value)}
          onChange={(_e, value) => {
            handleAddPerson(value);
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('additionalPersons')}
              slotProps={{
                ...params.slotProps,
                htmlInput: {
                  ...params.slotProps.htmlInput,
                  // Ohne expliziten Hint leitet Chromium die Tastaturaktion
                  // selbst ab: Es findet ein nachfolgendes fokussierbares
                  // Element und wählt IME_ACTION_NEXT. Diese Aktion behandelt
                  // der Browser intern — er setzt den Fokus weiter und schickt
                  // *kein* Tastenereignis an die Seite. Enter erreichte den
                  // Handler damit unter Android nie (#712).
                  enterKeyHint: 'done',
                },
              }}
            />
          )}
        />
        )}
      </Box>

      {canWrite && (
        <VehicleQuickAddChips
          selectedNames={[]}
          existingNames={existingVehicleNames}
          onToggle={handleAddVehicle}
          onRemove={handleRemoveVehicleByName}
        />
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {isMobile ? (
          /* ─── Mobile: compact table ─── */
          <TableContainer>
            <Table size="small" sx={{ tableLayout: 'auto' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 32, p: 0.5 }} />
                  <TableCell sx={{ p: 0.5 }}>{t('cols.name')}</TableCell>
                  <TableCell sx={{ p: 0.5, minWidth: 60 }}>{t('cols.function')}</TableCell>
                  <TableCell sx={{ p: 0.5, minWidth: 60 }}>{t('cols.vehicle')}</TableCell>
                </TableRow>
              </TableHead>
              <DroppableTableBody droppableId="unassigned">
                <TableRow>
                  <TableCell
                    colSpan={4}
                    sx={{ p: 0.5, backgroundColor: 'action.hover' }}
                  >
                    <Typography variant="subtitle2">
                      {t('available')} ({unassigned.length})
                    </Typography>
                  </TableCell>
                </TableRow>
                {renderRows(unassigned)}
              </DroppableTableBody>
              {vehicles.map((v) => {
                const assigned = assignedToVehicle(v.id!);
                return (
                  <DroppableTableBody key={v.id} droppableId={v.id!}>
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        sx={{ p: 0.5, backgroundColor: 'action.hover' }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Typography variant="subtitle2">
                            {v.name} ({assigned.length})
                          </Typography>
                          {canWrite && v.id && (
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={t('removeVehicleTooltip', {
                                name: v.name,
                              })}
                              onClick={() =>
                                handleRemoveVehicleRequest(v.id!)
                              }
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                    {renderRows(assigned)}
                  </DroppableTableBody>
                );
              })}
            </Table>
          </TableContainer>
        ) : (
          /* ─── Desktop: Kanban columns ─── */
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            <CrewVehicleColumn
              vehicleId={null}
              vehicleName={t('available')}
              assignments={unassigned}
              vehicles={vehicles}
              onFunktionChange={handleFunktionChange}
              onVehicleChange={handleVehicleChange}
              onRemove={removeAssignment}
              readOnly={!canWrite}
            />
            {vehicles.map((v) => (
              <CrewVehicleColumn
                key={v.id}
                vehicleId={v.id!}
                vehicleName={v.name}
                assignments={assignedToVehicle(v.id!)}
                vehicles={vehicles}
                onFunktionChange={handleFunktionChange}
                onVehicleChange={handleVehicleChange}
                onRemove={removeAssignment}
                onRemoveVehicle={
                  canWrite ? handleRemoveVehicleRequest : undefined
                }
                readOnly={!canWrite}
              />
            ))}
          </Box>
        )}
        <DragOverlay />
      </DndContext>

      {vehicleToRemove && (
        <ConfirmDialog
          title={t('removeVehicleTitle', { name: vehicleToRemove.name })}
          text={
            crewOnVehicleToRemove > 0
              ? t('removeVehicleConfirmWithCrew', {
                  name: vehicleToRemove.name,
                  count: crewOnVehicleToRemove,
                })
              : t('removeVehicleConfirm', { name: vehicleToRemove.name })
          }
          onConfirm={(confirmed) => {
            if (confirmed) {
              handleRemoveVehicleConfirmed();
            } else {
              setVehicleToRemove(undefined);
            }
          }}
        />
      )}
    </Box>
  );
}
