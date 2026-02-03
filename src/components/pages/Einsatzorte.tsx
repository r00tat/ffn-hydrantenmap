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
import { FirecallLocation, defaultFirecallLocation } from '../firebase/firestore';
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
            />
          ))}
          <EinsatzorteCard
            key="new"
            location={emptyLocation}
            isNew
            onChange={() => {}}
            onAdd={handleAdd}
          />
        </Box>
      ) : (
        <EinsatzorteTable
          locations={locations}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
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
