'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import EmailIcon from '@mui/icons-material/Email';
import { useCallback, useEffect, useRef, useState } from 'react';
import useFirecall from '../../hooks/useFirecall';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import useEmailImport from '../../hooks/useEmailImport';
import useVehicles from '../../hooks/useVehicles';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import { useVehicleSuggestions } from '../../hooks/useVehicleSuggestions';
import { FirecallLocation, defaultFirecallLocation, Fzg } from '../firebase/firestore';
import EinsatzorteTable from '../Einsatzorte/EinsatzorteTable';
import EinsatzorteCard from '../Einsatzorte/EinsatzorteCard';

export default function Einsatzorte() {
  const firecall = useFirecall();
  const { locations, addLocation, updateLocation, deleteLocation } =
    useFirecallLocations();
  const { importFromEmail, isImporting, lastResult, clearResult } =
    useEmailImport(firecall?.id);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const hasAutoImported = useRef(false);

  // Access existing vehicle items in this firecall
  const { vehicles: firecallVehicles } = useVehicles();

  // Vehicle suggestions from Kostenersatz and map vehicles
  const { suggestions: vehicleSuggestions, kostenersatzVehicleNames } =
    useVehicleSuggestions(firecallVehicles);

  // Hooks for creating/updating vehicle items
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const { saveHistory } = useSaveHistory();

  // Auto-import on mount when firecall.id is available
  useEffect(() => {
    if (firecall?.id && firecall.id !== 'unknown' && !hasAutoImported.current) {
      hasAutoImported.current = true;
      importFromEmail();
    }
  }, [firecall?.id, importFromEmail]);

  // Auto-hide success badge after 5 seconds
  useEffect(() => {
    if (lastResult && lastResult.added > 0) {
      const timer = setTimeout(() => {
        clearResult();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastResult, clearResult]);

  // Derive error message from lastResult
  const importError =
    lastResult?.errors && lastResult.errors.length > 0
      ? lastResult.errors[0]
      : null;

  const handleAdd = useCallback(
    async (location: Partial<FirecallLocation>) => {
      try {
        await addLocation(location);
      } catch (error) {
        setSnackbar('Fehler beim Hinzufügen');
        console.error('Add failed:', error);
      }
    },
    [addLocation]
  );

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<FirecallLocation>) => {
      try {
        await updateLocation(id, updates);
      } catch (error) {
        setSnackbar('Fehler beim Speichern');
        console.error('Update failed:', error);
      }
    },
    [updateLocation]
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
    [deleteLocation]
  );

  /**
   * Called when a Kostenersatz vehicle is added to a location.
   * Creates or updates the vehicle item on the map with the Einsatzort's position.
   */
  const handleKostenersatzVehicleAdded = useCallback(
    async (vehicleName: string, location: FirecallLocation) => {
      // Determine position: use Einsatzort coordinates, fallback to firecall position
      const lat = location.lat ?? firecall?.lat;
      const lng = location.lng ?? firecall?.lng;

      if (lat === undefined || lng === undefined) {
        console.warn(
          `Cannot place vehicle "${vehicleName}": no coordinates available for location or firecall`
        );
        return;
      }

      // Check if vehicle already exists in firecall items (by name match)
      const existingVehicle = firecallVehicles.find(
        (v) => v.name.toLowerCase() === vehicleName.toLowerCase()
      );

      try {
        if (existingVehicle) {
          // Vehicle exists: create history checkpoint, then update position
          console.info(
            `Updating existing vehicle "${vehicleName}" position to ${lat}, ${lng}`
          );

          // Save history checkpoint before the move (captures current state)
          await saveHistory(`Fahrzeug ${vehicleName} Positionsupdate`);

          // Update the vehicle's position
          await updateFirecallItem({
            ...existingVehicle,
            lat,
            lng,
          });

          setSnackbar(`${vehicleName} Position aktualisiert`);
        } else {
          // Vehicle doesn't exist: create new vehicle item
          console.info(
            `Creating new vehicle "${vehicleName}" at position ${lat}, ${lng}`
          );

          const newVehicle: Fzg = {
            name: vehicleName,
            type: 'vehicle',
            lat,
            lng,
          };

          await addFirecallItem(newVehicle);
          setSnackbar(`${vehicleName} auf Karte hinzugefügt`);
        }
      } catch (error) {
        console.error(`Failed to add/update vehicle "${vehicleName}":`, error);
        setSnackbar(`Fehler beim Aktualisieren von ${vehicleName}`);
      }
    },
    [firecall, firecallVehicles, addFirecallItem, updateFirecallItem, saveHistory]
  );

  if (!firecall || firecall.id === 'unknown') {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Kein Einsatz ausgewählt</Typography>
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
        <Typography variant="h5">Einsatzorte - {firecall.name}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {lastResult && lastResult.added > 0 && (
            <Chip
              label={`${lastResult.added} neue Standorte`}
              color="success"
              size="small"
            />
          )}
          <Tooltip title="E-Mails prüfen">
            <span>
              <IconButton
                onClick={importFromEmail}
                disabled={isImporting}
                size="small"
              >
                {isImporting ? (
                  <CircularProgress size={20} />
                ) : (
                  <EmailIcon />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {isMobile ? (
        <Box>
          {locations.map((location) => (
            <EinsatzorteCard
              key={location.id}
              location={location}
              onChange={(updates) => handleUpdate(location.id!, updates)}
              onDelete={() => handleDelete(location.id!)}
              vehicleSuggestions={vehicleSuggestions}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
            />
          ))}
          <EinsatzorteCard
            key="new"
            location={emptyLocation}
            isNew
            onChange={() => {}}
            onAdd={handleAdd}
            vehicleSuggestions={vehicleSuggestions}
            kostenersatzVehicleNames={kostenersatzVehicleNames}
            onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
          />
        </Box>
      ) : (
        <EinsatzorteTable
          locations={locations}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
          vehicleSuggestions={vehicleSuggestions}
          kostenersatzVehicleNames={kostenersatzVehicleNames}
          onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
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
