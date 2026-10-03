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
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  ButtonBase,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
import {
  collectUnconfirmedRecipients,
  isManualEntry,
  visibleCrewAssignments,
} from '../../common/crewMerge';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useCrewAssignments, {
  BlaulichtSmsRecipient,
} from '../../hooks/useCrewAssignments';
import { useFirecall } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import useVehicles from '../../hooks/useVehicles';
import { nimmtBesatzung } from '../../common/vehicle-utils';
import {
  groupVehiclesByFw,
  OwnFleet,
  VehicleGroup,
} from '../../common/vehicleGroups';
import useOwnFleet from '../../hooks/useOwnFleet';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import {
  CrewAssignment,
  CrewFunktion,
  CREW_FUNKTIONEN,
  Fzg,
  funktionAbkuerzung,
} from '../firebase/firestore';
import VehicleQuickAddChips from '../FirecallItems/VehicleQuickAddChips';
import { vehicleSelectItems } from '../FirecallItems/vehicleSelectItems';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import CrewVehicleColumn from './CrewVehicleColumn';

export interface CrewAssignmentBoardProps {
  alarms?: BlaulichtSmsAlarm[] | null;
  /**
   * Überschrift weglassen: Auf der Detailseite steht der Name des Abschnitts
   * bereits in der Kopfzeile zum Aufklappen.
   */
  hideTitle?: boolean;
}

/* ─── Mobile: compact table components ─── */

function DroppableTableBody({
  droppableId,
  children,
  disabled = false,
}: {
  droppableId: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    disabled,
  });
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
  fleet,
  noFwLabel,
  onFunktionChange,
  onVehicleChange,
  onRemove,
  readOnly = false,
}: {
  assignment: CrewAssignment;
  vehicles: Fzg[];
  fleet: OwnFleet;
  noFwLabel: string;
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
            {vehicleSelectItems(vehicles, fleet, noFwLabel)}
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

export default function CrewAssignmentBoard({
  alarms,
  hideTitle = false,
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
  const fleet = useOwnFleet();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const existingVehicleNames = useMemo(
    () => vehicles.map((v) => v.name),
    [vehicles],
  );

  // Recipients across all alarms who did NOT confirm (no / unknown / pending),
  // je Person einmal, ohne wen, der in einem anderen Alarm zugesagt hat oder —
  // auch unter anderer ID — schon in der Besatzung steht (#835). Dazu die
  // Personenliste des Fahrtenbuchs.
  const additionalPersonOptions = useMemo<CrewPersonOption[]>(() => {
    // Über `normalizePersonName`, nicht über den rohen Namen: Aus BlaulichtSMS
    // kommt „Nachname Vorname", die Personenliste führt „Vorname Nachname" —
    // ohne das stünde derselbe Mensch zweimal in der Auswahl.
    const takenNames = new Set(
      crewAssignments.map((a) => normalizePersonName(a.name)),
    );
    const options: CrewPersonOption[] = [];

    for (const recipient of collectUnconfirmedRecipients(
      alarms ?? [],
      crewAssignments,
    )) {
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

  // Von Hand angelegte Einträge immer, aus Alarmen übernommene nur, solange
  // die Person in einem der Alarme zugesagt hat — unter welcher ID auch immer,
  // denn BlaulichtSMS vergibt sie je Alarm (#835). Je Person ein Eintrag, der
  // bearbeitete. Ohne Alarme alle Einträge.
  const validAssignments = useMemo(
    () => visibleCrewAssignments(crewAssignments, alarms),
    [crewAssignments, alarms],
  );

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

  // Aufbauten und Anhänger nehmen keine Personen auf und tauchen deshalb in
  // keinem Auswahlfeld auf (#795).
  const crewVehicles = useMemo(
    () => vehicles.filter((v) => nimmtBesatzung(v)),
    [vehicles],
  );

  /**
   * Die Einsatzmittel, die im Board eine Spalte bzw. einen Abschnitt bekommen.
   *
   * Ein Aufbau oder Anhänger, in dem nie jemand sitzen kann, ist hier nur
   * Platzhalter: Auf dem Desktop verdrängt jede solche Spalte 220 px weit die
   * Fahrzeuge, um die es geht (#801). Entfernt wird das Einsatzmittel aus dem
   * Einsatz weiterhin über die Fahrzeug-Chips oberhalb des Boards.
   *
   * Ausnahme sind Zuordnungen aus der Zeit vor #795: Hängen an einem Aufbau
   * noch Personen, bleibt er sichtbar — sonst wären sie unsichtbar zugeordnet
   * und ließen sich nicht mehr auf ein Fahrzeug umhängen.
   */
  const boardVehicles = useMemo(() => {
    const besetzt = new Set(
      displayAssignments
        .map((a) => a.vehicleId)
        .filter((id): id is string => !!id),
    );
    return vehicles.filter(
      (v) => nimmtBesatzung(v) || (v.id ? besetzt.has(v.id) : false),
    );
  }, [displayAssignments, vehicles]);

  const unassigned = displayAssignments.filter((a) => a.vehicleId === null);
  const assignedToVehicle = useCallback(
    (vehicleId: string) =>
      displayAssignments.filter((a) => a.vehicleId === vehicleId),
    [displayAssignments],
  );

  /**
   * Die Spalten nach Feuerwehr: die eigenen Fahrzeuge vorne und immer offen,
   * die fremden je Feuerwehr in einem Abschnitt zum Aufklappen. Fremden
   * Fahrzeugen wird selten jemand zugeordnet; offen ist ein Abschnitt deshalb
   * nur, wenn dort schon Personen stehen oder jemand ihn aufklappt.
   */
  const boardGroups = useMemo(
    () => groupVehiclesByFw(boardVehicles, fleet),
    [boardVehicles, fleet],
  );
  const ownBoardVehicles = boardGroups.find((g) => g.own)?.vehicles ?? [];
  const foreignBoardGroups = boardGroups.filter((g) => !g.own);

  // Nur, was jemand von Hand umgeschaltet hat; sonst entscheidet die Besatzung.
  const [groupToggles, setGroupToggles] = useState<Record<string, boolean>>(
    {},
  );
  const groupCrewCount = useCallback(
    (group: VehicleGroup) =>
      group.vehicles.reduce(
        (sum, v) => sum + (v.id ? assignedToVehicle(v.id).length : 0),
        0,
      ),
    [assignedToVehicle],
  );
  const isGroupOpen = (group: VehicleGroup) =>
    groupToggles[group.key] ?? groupCrewCount(group) > 0;
  const toggleGroup = (group: VehicleGroup) =>
    setGroupToggles((prev) => ({ ...prev, [group.key]: !isGroupOpen(group) }));
  const groupLabel = (group: VehicleGroup) =>
    group.label || t('noFireDepartment');
  const groupSummary = (group: VehicleGroup) =>
    t('fwGroupSummary', {
      vehicles: group.vehicles.length,
      persons: groupCrewCount(group),
    });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const assignmentId = active.id as string;
      const targetVehicleId =
        over.id === 'unassigned' ? null : (over.id as string);
      const targetVehicle = targetVehicleId
        ? vehicles.find((v) => v.id === targetVehicleId)
        : undefined;
      // Das Ablageziel ist gesperrt, der Riegel bleibt trotzdem hier: Eine
      // Zuordnung an einen Aufbau wäre fachlich falsch, egal woher sie kommt.
      if (targetVehicleId && (!targetVehicle || !nimmtBesatzung(targetVehicle))) {
        return;
      }

      assignVehicle(assignmentId, targetVehicleId, targetVehicle?.name || '');
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
        vehicles={crewVehicles}
        fleet={fleet}
        noFwLabel={t('noFireDepartment')}
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

  const renderVehicleTableBody = (v: Fzg) => {
    const assigned = assignedToVehicle(v.id!);
    return (
      <DroppableTableBody
        key={v.id}
        droppableId={v.id!}
        disabled={!nimmtBesatzung(v)}
      >
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
                {!nimmtBesatzung(v) && ` — ${t('noCrewVehicle')}`}
              </Typography>
              {canWrite && v.id && (
                <IconButton
                  size="small"
                  color="error"
                  aria-label={t('removeVehicleTooltip', {
                    name: v.name,
                  })}
                  onClick={() => handleRemoveVehicleRequest(v.id!)}
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
  };

  const renderVehicleColumn = (v: Fzg) => (
    <CrewVehicleColumn
      key={v.id}
      vehicleId={v.id!}
      vehicleName={v.name}
      assignments={assignedToVehicle(v.id!)}
      vehicles={crewVehicles}
      noCrew={!nimmtBesatzung(v)}
      onFunktionChange={handleFunktionChange}
      onVehicleChange={handleVehicleChange}
      onRemove={removeAssignment}
      onRemoveVehicle={canWrite ? handleRemoveVehicleRequest : undefined}
      readOnly={!canWrite}
    />
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {!hideTitle && <Typography variant="h5">{t('title')}</Typography>}
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
              {ownBoardVehicles.map(renderVehicleTableBody)}
              {foreignBoardGroups.map((group) => {
                const open = isGroupOpen(group);
                return (
                  <React.Fragment key={`fw:${group.key}`}>
                    <TableBody>
                      <TableRow data-testid="crew-fw-group">
                        <TableCell colSpan={4} sx={{ p: 0 }}>
                          <ButtonBase
                            aria-expanded={open}
                            onClick={() => toggleGroup(group)}
                            sx={{
                              width: '100%',
                              justifyContent: 'flex-start',
                              gap: 1,
                              p: 0.5,
                              textAlign: 'left',
                            }}
                          >
                            <ExpandMoreIcon
                              fontSize="small"
                              sx={{
                                transform: open ? 'none' : 'rotate(-90deg)',
                                transition: 'transform 0.2s',
                              }}
                            />
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                              {groupLabel(group)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {groupSummary(group)}
                            </Typography>
                          </ButtonBase>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                    {open && group.vehicles.map(renderVehicleTableBody)}
                  </React.Fragment>
                );
              })}
            </Table>
          </TableContainer>
        ) : (
          /* ─── Desktop: Kanban columns ─── */
          <Box>
            <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
              <CrewVehicleColumn
                vehicleId={null}
                vehicleName={t('available')}
                assignments={unassigned}
                vehicles={crewVehicles}
                onFunktionChange={handleFunktionChange}
                onVehicleChange={handleVehicleChange}
                onRemove={removeAssignment}
                readOnly={!canWrite}
              />
              {ownBoardVehicles.map(renderVehicleColumn)}
            </Box>
            {foreignBoardGroups.map((group) => (
              <Accordion
                key={`fw:${group.key}`}
                data-testid="crew-fw-group"
                expanded={isGroupOpen(group)}
                onChange={() => toggleGroup(group)}
                disableGutters
                variant="outlined"
                slotProps={{ transition: { unmountOnExit: true } }}
                sx={{ mt: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {groupLabel(group)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {groupSummary(group)}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
                    {group.vehicles.map(renderVehicleColumn)}
                  </Box>
                </AccordionDetails>
              </Accordion>
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
