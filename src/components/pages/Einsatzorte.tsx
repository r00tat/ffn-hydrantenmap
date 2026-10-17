'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import EmailIcon from '@mui/icons-material/Email';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useFirecall from '../../hooks/useFirecall';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import useAssignToLocation from '../Einsatzorte/useAssignToLocation';
import { unitWithVehicles } from './location-assignment';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import useEmailImport from '../../hooks/useEmailImport';
import useVehicles from '../../hooks/useVehicles';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import { useVehicleSuggestions } from '../../hooks/useVehicleSuggestions';
import {
  AssignableUnit,
  FirecallLocation,
  defaultFirecallLocation,
  Fzg,
} from '../firebase/firestore';
import EinsatzorteTable, {
  type EinsatzorteSortField,
} from '../Einsatzorte/EinsatzorteTable';
import EinsatzorteCard from '../Einsatzorte/EinsatzorteCard';
import {
  assignedUnitLabel,
  getLocationDisplayName,
  locationCreatedEntry,
  unitLabel,
  vehicleAssignedEntry,
  vehicleRemovedEntry,
} from '../Einsatzorte/locationDiary';
import useLocationDiary from '../Einsatzorte/useLocationDiary';
import useLocationLayers from '../../hooks/useLocationLayers';

export interface EinsatzorteProps {
  /** Überschrift weglassen, wenn der Aufrufer schon eine hat. */
  hideTitle?: boolean;
}

export default function Einsatzorte({ hideTitle = false }: EinsatzorteProps) {
  const t = useTranslations('einsatzorte');
  const firecall = useFirecall();
  const { locations, addLocation, updateLocation, deleteLocation } =
    useFirecallLocations();
  const canWrite = useFirecallWriteAccess();
  const { importFromEmail, isImporting, lastResult, clearResult } =
    useEmailImport(firecall?.id);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const hasAutoImported = useRef(false);

  // Access existing vehicle items and tactical units in this firecall
  const { vehicles: firecallVehicles, tacticalUnits } = useVehicles();
  const assignableUnits = useMemo<AssignableUnit[]>(
    () => [...firecallVehicles, ...tacticalUnits],
    [firecallVehicles, tacticalUnits],
  );

  const assignToLocation = useAssignToLocation(
    locations,
    updateLocation,
    assignableUnits,
  );

  // Suggestions from Kostenersatz, map vehicles and tactical units
  const { mapVehicles, kostenersatzVehicleNames } =
    useVehicleSuggestions(assignableUnits);

  // Hooks for creating/updating vehicle items
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const { saveHistory } = useSaveHistory();

  const addDiaryEntry = useLocationDiary();
  const locationLayers = useLocationLayers();

  // Sorting state
  const [sortField, setSortField] = useState<EinsatzorteSortField>('created');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSortClick = useCallback(
    (field: EinsatzorteSortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField],
  );

  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      let result: number;
      switch (sortField) {
        case 'name':
          result = (a.name || '').localeCompare(b.name || '');
          break;
        case 'address': {
          const aAddr = [a.city, a.street, a.number].filter(Boolean).join(' ');
          const bAddr = [b.city, b.street, b.number].filter(Boolean).join(' ');
          result = aAddr.localeCompare(bAddr);
          break;
        }
        case 'status':
          result = (a.status || '').localeCompare(b.status || '');
          break;
        case 'vehicles': {
          const aVeh = Object.values(a.vehicles || {}).join(', ');
          const bVeh = Object.values(b.vehicles || {}).join(', ');
          result = aVeh.localeCompare(bVeh);
          break;
        }
        case 'alarmTime':
          result = (a.alarmTime || '').localeCompare(b.alarmTime || '');
          break;
        case 'startTime':
          result = (a.startTime || '').localeCompare(b.startTime || '');
          break;
        case 'doneTime':
          result = (a.doneTime || '').localeCompare(b.doneTime || '');
          break;
        case 'created':
        default:
          result =
            new Date(a.created || 0).getTime() -
            new Date(b.created || 0).getTime();
          break;
      }
      return sortDirection === 'asc' ? result : -result;
    });
  }, [locations, sortField, sortDirection]);

  const isGroupFfn = !firecall?.group || firecall.group === 'ffnd';

  // Auto-import on mount and every 60 seconds when firecall.id is available
  useEffect(() => {
    if (!firecall?.id || firecall.id === 'unknown' || !isGroupFfn) return;

    if (!hasAutoImported.current) {
      hasAutoImported.current = true;
      importFromEmail();
    }

    const interval = setInterval(() => {
      importFromEmail();
    }, 60_000);

    return () => clearInterval(interval);
  }, [firecall?.id, isGroupFfn, importFromEmail]);

  // Auto-hide success badge after 5 seconds + create diary entry for imports
  useEffect(() => {
    if (lastResult && lastResult.added > 0) {
      const names = lastResult.addedNames || [];
      addDiaryEntry(
        `${lastResult.added} Einsatzort${lastResult.added > 1 ? 'e' : ''} per E-Mail importiert`,
        names.length > 0 ? names.join(', ') : '',
      );

      const timer = setTimeout(() => {
        clearResult();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastResult, clearResult, addDiaryEntry]);

  // Derive error message from lastResult
  const importError =
    lastResult?.errors && lastResult.errors.length > 0
      ? lastResult.errors[0]
      : null;

  const handleAdd = useCallback(
    async (location: Partial<FirecallLocation>) => {
      try {
        await addLocation(location);
        const entry = locationCreatedEntry(location);
        addDiaryEntry(entry.name, entry.beschreibung);
      } catch (error) {
        setSnackbar('Fehler beim Hinzufügen');
        console.error('Add failed:', error);
      }
    },
    [addLocation, addDiaryEntry],
  );

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<FirecallLocation>) => {
      try {
        const location = locations.find((l) => l.id === id);

        await updateLocation(id, updates);

        if (location) {
          const displayName = getLocationDisplayName(location);

          // Diary entry for status changes
          if (updates.status && updates.status !== location.status) {
            addDiaryEntry(`Einsatzort ${displayName}: ${updates.status}`);
          }

          // Diary entry for vehicle unassignment
          if (updates.vehicles) {
            const oldVehicles = location.vehicles || {};
            for (const [vehicleId, vehicleName] of Object.entries(
              oldVehicles,
            )) {
              if (!(vehicleId in updates.vehicles)) {
                addDiaryEntry(
                  vehicleRemovedEntry(
                    assignedUnitLabel(vehicleId, vehicleName, assignableUnits),
                    location,
                  ),
                );
                const unit = assignableUnits.find((u) => u.id === vehicleId);
                if (unit) await locationLayers.releaseItem(unit, location);
              }
            }
          }
        }
      } catch (error) {
        setSnackbar('Fehler beim Speichern');
        console.error('Update failed:', error);
      }
    },
    [updateLocation, locations, addDiaryEntry, assignableUnits, locationLayers],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteLocation(id);
      } catch (error) {
        setSnackbar('Fehler beim Löschen');
        console.error('Delete failed:', error);
      }
    },
    [deleteLocation],
  );

  /**
   * Called when a Kostenersatz vehicle is selected for a location.
   * Creates or finds the vehicle on the map, then adds its ID to the location.
   */
  const handleKostenersatzVehicleSelected = useCallback(
    async (vehicleName: string, location: FirecallLocation) => {
      // Determine position: use Einsatzort coordinates, fallback to firecall position
      const lat = location.lat ?? firecall?.lat;
      const lng = location.lng ?? firecall?.lng;

      if (lat === undefined || lng === undefined) {
        console.warn(
          `Cannot place vehicle "${vehicleName}": no coordinates available for location or firecall`,
        );
        return;
      }

      // Check if vehicle already exists in firecall items (by name match)
      const existingVehicle = firecallVehicles.find(
        (v) => v.name.toLowerCase() === vehicleName.toLowerCase(),
      );

      try {
        // Save history snapshot before any changes
        const locationDisplayName =
          location.name ||
          [location.street, location.number, location.city]
            .filter(Boolean)
            .join(' ');
        await saveHistory(
          `Status vor ${vehicleName} zu Einsatzort ${locationDisplayName} zugeordnet`,
        );

        let vehicleId: string;
        let vehicleDisplayName: string;
        let diaryName: string;
        const layer = await locationLayers.layerFor(location);

        if (existingVehicle && existingVehicle.id) {
          // Vehicle exists: update position and use existing ID
          vehicleId = existingVehicle.id;
          vehicleDisplayName = existingVehicle.name;
          diaryName = unitLabel(existingVehicle);

          console.info(
            `Updating existing vehicle "${vehicleName}" position to ${lat}, ${lng}`,
          );

          await updateFirecallItem({
            ...existingVehicle,
            lat,
            lng,
            ...(layer ? { layer } : {}),
          });

          setSnackbar(`${vehicleName} Position aktualisiert`);
        } else {
          // Vehicle doesn't exist: create new vehicle item
          console.info(
            `Creating new vehicle "${vehicleName}" at position ${lat}, ${lng}`,
          );

          const newVehicle: Fzg = {
            name: vehicleName,
            type: 'vehicle',
            fw: 'Neusiedl am See',
            lat,
            lng,
            layer,
          };

          const docRef = await addFirecallItem(newVehicle);
          vehicleId = docRef.id;
          vehicleDisplayName = vehicleName;
          diaryName = unitLabel(newVehicle);

          setSnackbar(`${vehicleName} auf Karte hinzugefügt`);
        }

        // Now add the vehicle reference to the location
        const currentVehicles =
          (location.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          await updateLocation(location.id!, {
            vehicles: { ...currentVehicles, [vehicleId]: vehicleDisplayName },
          });
        }

        // Diary entry for vehicle assignment
        addDiaryEntry(vehicleAssignedEntry(diaryName, location));
      } catch (error) {
        console.error(`Failed to add/update vehicle "${vehicleName}":`, error);
        setSnackbar(`Fehler beim Aktualisieren von ${vehicleName}`);
      }
    },
    [
      firecall,
      firecallVehicles,
      addFirecallItem,
      updateFirecallItem,
      saveHistory,
      updateLocation,
      addDiaryEntry,
      locationLayers,
    ],
  );

  const handleMapVehicleSelected = useCallback(
    async (
      vehicleId: string,
      vehicleName: string,
      location: FirecallLocation,
    ) => {
      try {
        // Eine Einheit mit Fahrzeugen zieht als Ganzes um — wie in der
        // Tabelle auf der Seite „Einsatzmittel".
        const selected = assignableUnits.find((u) => u.id === vehicleId);
        if (
          selected &&
          location.id &&
          unitWithVehicles(selected, assignableUnits).length > 1
        ) {
          await assignToLocation(selected, location.id);
          return;
        }

        const locationDisplayName = getLocationDisplayName(location);
        await saveHistory(
          `Status vor ${vehicleName} zu Einsatzort ${locationDisplayName} zugeordnet`,
        );

        const currentVehicles =
          (location.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          await updateLocation(location.id!, {
            vehicles: { ...currentVehicles, [vehicleId]: vehicleName },
          });
        }

        // Fahrzeug bzw. Einheit auf der Karte zum Einsatzort versetzen und
        // in seine Ebene legen
        const unit = assignableUnits.find((u) => u.id === vehicleId);
        if (unit) await locationLayers.placeItem(unit, location);

        // Diary entry for vehicle assignment
        addDiaryEntry(
          vehicleAssignedEntry(
            assignedUnitLabel(vehicleId, vehicleName, assignableUnits),
            location,
          ),
        );
      } catch (error) {
        console.error(`Failed to assign vehicle "${vehicleName}":`, error);
        setSnackbar(`Fehler beim Zuordnen von ${vehicleName}`);
      }
    },
    [
      saveHistory,
      updateLocation,
      assignableUnits,
      locationLayers,
      addDiaryEntry,
      assignToLocation,
    ],
  );

  const handleCreateVehicle = useCallback(
    async (name: string, fw: string, location: FirecallLocation) => {
      const lat = location.lat ?? firecall?.lat;
      const lng = location.lng ?? firecall?.lng;

      if (lat === undefined || lng === undefined) {
        console.warn(
          `Cannot place vehicle "${name}": no coordinates available for location or firecall`,
        );
        return;
      }

      try {
        const locationDisplayName = getLocationDisplayName(location);
        await saveHistory(
          `Status vor ${name} zu Einsatzort ${locationDisplayName} zugeordnet`,
        );

        const newVehicle: Fzg = {
          name,
          type: 'vehicle',
          fw: fw || undefined,
          lat,
          lng,
          layer: await locationLayers.layerFor(location),
        };

        const docRef = await addFirecallItem(newVehicle);
        const vehicleId = docRef.id;

        const vehicleDisplayName = fw ? `${name} ${fw}` : name;
        setSnackbar(`${vehicleDisplayName} erstellt`);

        // Add vehicle reference to the location
        const currentVehicles =
          (location.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          await updateLocation(location.id!, {
            vehicles: { ...currentVehicles, [vehicleId]: vehicleDisplayName },
          });
        }

        addDiaryEntry(vehicleAssignedEntry(vehicleDisplayName, location));
      } catch (error) {
        console.error(`Failed to create vehicle "${name}":`, error);
        setSnackbar(`Fehler beim Erstellen von ${name}`);
      }
    },
    [
      firecall,
      addFirecallItem,
      saveHistory,
      updateLocation,
      addDiaryEntry,
      locationLayers,
    ],
  );

  if (!firecall || firecall.id === 'unknown') {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>{t('noFirecall')}</Typography>
      </Box>
    );
  }

  const emptyLocation: FirecallLocation = {
    ...defaultFirecallLocation,
    created: '',
    creator: '',
  } as FirecallLocation;

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        {hideTitle ? (
          <Box />
        ) : (
          <Typography variant="h5">
            {t('title', { name: firecall.name })}
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {canWrite && (
            <Tooltip title={t('locationLayersHint')}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={locationLayers.enabled}
                    onChange={(_event, checked) =>
                      void locationLayers.setEnabled(
                        checked,
                        locations,
                        assignableUnits,
                      )
                    }
                  />
                }
                label={t('locationLayers')}
              />
            </Tooltip>
          )}
          {isGroupFfn && lastResult && lastResult.added > 0 && (
            <Chip
              label={`${lastResult.added} neue Standorte`}
              color="success"
              size="small"
            />
          )}
          {isGroupFfn && canWrite && (
            <Tooltip title={t('checkEmails')}>
              <span>
                <IconButton
                  onClick={importFromEmail}
                  disabled={isImporting}
                  size="small"
                >
                  {isImporting ? <CircularProgress size={20} /> : <EmailIcon />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>

      {isMobile ? (
        <Box>
          {sortedLocations.map((location) => (
            <EinsatzorteCard
              key={location.id}
              location={location}
              onChange={(updates) => handleUpdate(location.id!, updates)}
              onDelete={() => handleDelete(location.id!)}
              mapVehicles={mapVehicles}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
              onMapVehicleSelected={handleMapVehicleSelected}
              onCreateVehicle={handleCreateVehicle}
              readOnly={!canWrite}
            />
          ))}
          {/* Die leere Karte am Ende ist die Eingabemaske für neue Standorte —
              ohne Schreibrecht gibt es sie nicht. */}
          {canWrite && (
            <EinsatzorteCard
              key="new"
              location={emptyLocation}
              isNew
              onChange={() => {}}
              onAdd={handleAdd}
              mapVehicles={mapVehicles}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
              onMapVehicleSelected={handleMapVehicleSelected}
              onCreateVehicle={handleCreateVehicle}
            />
          )}
        </Box>
      ) : (
        <EinsatzorteTable
          locations={sortedLocations}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
          mapVehicles={mapVehicles}
          kostenersatzVehicleNames={kostenersatzVehicleNames}
          onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
          onMapVehicleSelected={handleMapVehicleSelected}
          onCreateVehicle={handleCreateVehicle}
          sortField={sortField}
          sortDirection={sortDirection}
          onSortClick={handleSortClick}
          readOnly={!canWrite}
        />
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />

      <Snackbar
        open={!!importError}
        autoHideDuration={5000}
        onClose={clearResult}
      >
        <Alert onClose={clearResult} severity="error" sx={{ width: '100%' }}>
          {importError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
