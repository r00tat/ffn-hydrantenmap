'use client';

import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useFirecall from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import { useVehicleSuggestions } from '../../hooks/useVehicleSuggestions';
import useVehicles from '../../hooks/useVehicles';
import { Diary, FirecallLocation, Fzg } from '../firebase/firestore';
import EinsatzorteCard from './EinsatzorteCard';

function getLocationDisplayName(location: Partial<FirecallLocation>): string {
  return (
    location.name ||
    [location.street, location.number, location.city]
      .filter(Boolean)
      .join(' ') ||
    'Unbekannt'
  );
}

type EditableKey = keyof FirecallLocation;

const EDITABLE_KEYS: EditableKey[] = [
  'name',
  'street',
  'number',
  'city',
  'status',
  'description',
  'info',
  'alarmTime',
  'startTime',
  'doneTime',
  'lat',
  'lng',
  'vehicles',
];

function computeDiff(
  original: FirecallLocation,
  edited: FirecallLocation,
): Partial<FirecallLocation> {
  const diff: Partial<FirecallLocation> = {};
  for (const key of EDITABLE_KEYS) {
    const o = original[key];
    const e = edited[key];
    if (JSON.stringify(o) !== JSON.stringify(e)) {
      (diff as Record<string, unknown>)[key] = e;
    }
  }
  return diff;
}

interface EinsatzortEditDialogProps {
  location: FirecallLocation | undefined;
  onClose: () => void;
}

export default function EinsatzortEditDialog({
  location,
  onClose,
}: EinsatzortEditDialogProps) {
  const firecall = useFirecall();
  const { updateLocation, deleteLocation } = useFirecallLocations();
  const { vehicles: firecallVehicles } = useVehicles();
  const { mapVehicles, kostenersatzVehicleNames } =
    useVehicleSuggestions(firecallVehicles);
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const { saveHistory } = useSaveHistory();

  const [working, setWorking] = useState<FirecallLocation | undefined>(
    location,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWorking(location);
    setError(null);
  }, [location]);

  const dirty = useMemo(() => {
    if (!location || !working) return false;
    return Object.keys(computeDiff(location, working)).length > 0;
  }, [location, working]);

  const addDiaryEntry = useCallback(
    (name: string, beschreibung?: string) =>
      addFirecallItem({
        type: 'diary',
        art: 'M',
        name,
        beschreibung: beschreibung || '',
      } as Diary).catch(() => {}),
    [addFirecallItem],
  );

  const handleLocalChange = useCallback(
    (updates: Partial<FirecallLocation>) => {
      setWorking((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    [],
  );

  const handleDelete = useCallback(async () => {
    if (!location?.id) return;
    try {
      await deleteLocation(location.id);
      onClose();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Löschen fehlgeschlagen');
    }
  }, [location, deleteLocation, onClose]);

  const handleKostenersatzVehicleSelected = useCallback(
    async (vehicleName: string, loc: FirecallLocation) => {
      const lat = loc.lat ?? firecall?.lat;
      const lng = loc.lng ?? firecall?.lng;
      if (lat === undefined || lng === undefined) return;

      const existingVehicle = firecallVehicles.find(
        (v) => v.name.toLowerCase() === vehicleName.toLowerCase(),
      );
      try {
        const displayName = getLocationDisplayName(loc);
        await saveHistory(
          `Status vor ${vehicleName} zu Einsatzort ${displayName} zugeordnet`,
        );

        let vehicleId: string;
        let vehicleDisplayName: string;

        if (existingVehicle && existingVehicle.id) {
          vehicleId = existingVehicle.id;
          vehicleDisplayName = existingVehicle.name;
          await updateFirecallItem({ ...existingVehicle, lat, lng });
        } else {
          const newVehicle: Fzg = {
            name: vehicleName,
            type: 'vehicle',
            fw: 'Neusiedl am See',
            lat,
            lng,
          };
          const docRef = await addFirecallItem(newVehicle);
          vehicleId = docRef.id;
          vehicleDisplayName = vehicleName;
        }

        const currentVehicles =
          (loc.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          handleLocalChange({
            vehicles: { ...currentVehicles, [vehicleId]: vehicleDisplayName },
          });
        }
      } catch (err) {
        console.error(`Failed to add/update vehicle "${vehicleName}":`, err);
        setError(`Fehler bei Fahrzeug ${vehicleName}`);
      }
    },
    [
      firecall,
      firecallVehicles,
      saveHistory,
      updateFirecallItem,
      addFirecallItem,
      handleLocalChange,
    ],
  );

  const handleMapVehicleSelected = useCallback(
    async (
      vehicleId: string,
      vehicleName: string,
      loc: FirecallLocation,
    ) => {
      try {
        const displayName = getLocationDisplayName(loc);
        await saveHistory(
          `Status vor ${vehicleName} zu Einsatzort ${displayName} zugeordnet`,
        );
        const currentVehicles =
          (loc.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          handleLocalChange({
            vehicles: { ...currentVehicles, [vehicleId]: vehicleName },
          });
        }
      } catch (err) {
        console.error(`Failed to assign vehicle "${vehicleName}":`, err);
        setError(`Fehler beim Zuordnen von ${vehicleName}`);
      }
    },
    [saveHistory, handleLocalChange],
  );

  const handleCreateVehicle = useCallback(
    async (name: string, fw: string, loc: FirecallLocation) => {
      const lat = loc.lat ?? firecall?.lat;
      const lng = loc.lng ?? firecall?.lng;
      if (lat === undefined || lng === undefined) return;
      try {
        const displayName = getLocationDisplayName(loc);
        await saveHistory(
          `Status vor ${name} zu Einsatzort ${displayName} zugeordnet`,
        );
        const newVehicle: Fzg = {
          name,
          type: 'vehicle',
          fw: fw || undefined,
          lat,
          lng,
        };
        const docRef = await addFirecallItem(newVehicle);
        const vehicleId = docRef.id;
        const vehicleDisplayName = fw ? `${name} ${fw}` : name;

        const currentVehicles =
          (loc.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          handleLocalChange({
            vehicles: { ...currentVehicles, [vehicleId]: vehicleDisplayName },
          });
        }
      } catch (err) {
        console.error(`Failed to create vehicle "${name}":`, err);
        setError(`Fehler beim Erstellen von ${name}`);
      }
    },
    [firecall, saveHistory, addFirecallItem, handleLocalChange],
  );

  const handleSave = useCallback(async () => {
    if (!location?.id || !working) return;
    const diff = computeDiff(location, working);
    if (Object.keys(diff).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateLocation(location.id, diff);
      const displayName = getLocationDisplayName(working);
      if (diff.status && diff.status !== location.status) {
        addDiaryEntry(`Einsatzort ${displayName}: ${diff.status}`);
      }
      if (diff.vehicles) {
        const oldVehicles = location.vehicles || {};
        const newVehicles = diff.vehicles as Record<string, string>;
        for (const [vId, vName] of Object.entries(oldVehicles)) {
          if (!(vId in newVehicles)) {
            addDiaryEntry(`${vName} von Einsatzort ${displayName} abgezogen`);
          }
        }
        for (const [vId, vName] of Object.entries(newVehicles)) {
          if (!(vId in (oldVehicles as Record<string, string>))) {
            addDiaryEntry(`${vName} zu Einsatzort ${displayName} zugeordnet`);
          }
        }
      }
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
      setError('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }, [location, working, updateLocation, addDiaryEntry, onClose]);

  return (
    <Dialog open={!!location} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Einsatzort bearbeiten
        <IconButton
          aria-label="Schließen"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {working && (
          <EinsatzorteCard
            location={working}
            onChange={handleLocalChange}
            onDelete={handleDelete}
            mapVehicles={mapVehicles}
            kostenersatzVehicleNames={kostenersatzVehicleNames}
            onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
            onMapVehicleSelected={handleMapVehicleSelected}
            onCreateVehicle={handleCreateVehicle}
            debounceMs={0}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Abbrechen
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          Speichern
        </Button>
      </DialogActions>
    </Dialog>
  );
}
