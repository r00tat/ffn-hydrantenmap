'use client';

import { useState, useCallback } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MapIcon from '@mui/icons-material/Map';
import UploadIcon from '@mui/icons-material/Upload';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { PegelstandStation } from '../Map/layers/PegelstandLayer';
import {
  fetchOgcStations,
  importOgcStations,
  savePegelstandStation,
  deletePegelstandStation,
} from '../../app/admin/PegelstandAdminAction';
import { fetchPegelstandData } from '../Map/layers/PegelstandAction';
import LocationMapPicker from '../Einsatzorte/LocationMapPicker';

interface StationFormData {
  slug: string;
  name: string;
  type: 'river' | 'lake';
  hzbnr: string;
  lat: string;
  lng: string;
  detailUrl: string;
}

const emptyForm: StationFormData = {
  slug: '',
  name: '',
  type: 'river',
  hzbnr: '',
  lat: '',
  lng: '',
  detailUrl: '',
};

export default function PegelstandStations() {
  const stations = useFirebaseCollection<PegelstandStation>({
    collectionName: 'pegelstand_stations',
  });

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [formData, setFormData] = useState<StationFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportMessage(null);
    setImportError(null);

    try {
      const [ogcStations, pegelstandData] = await Promise.all([
        fetchOgcStations(),
        fetchPegelstandData(),
      ]);

      const scrapedSlugs = pegelstandData.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        type: entry.type,
        detailUrl: entry.detailUrl,
      }));

      const importCount = await importOgcStations(ogcStations, scrapedSlugs);
      setImportMessage(
        `${importCount} Stationen importiert (von ${ogcStations.length} OGC Stationen)`
      );
    } catch (error) {
      console.error('Import failed:', error);
      setImportError(
        `Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setImporting(false);
    }
  }, []);

  const handleAdd = useCallback(() => {
    setEditingSlug(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((station: PegelstandStation) => {
    setEditingSlug(station.id);
    setFormData({
      slug: station.id,
      name: station.name,
      type: station.type,
      hzbnr: station.hzbnr || '',
      lat: String(station.lat),
      lng: String(station.lng),
      detailUrl: station.detailUrl || '',
    });
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (station: PegelstandStation) => {
    if (!confirm(`Station "${station.name}" (${station.id}) wirklich löschen?`)) {
      return;
    }

    try {
      await deletePegelstandStation(station.id);
    } catch (error) {
      console.error('Delete failed:', error);
      alert(
        `Löschen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setEditingSlug(null);
    setFormData(emptyForm);
  }, []);

  const handleSave = useCallback(async () => {
    const slug = editingSlug || formData.slug.trim();
    if (!slug || !formData.name.trim()) return;

    setSaving(true);
    try {
      await savePegelstandStation(slug, {
        name: formData.name.trim(),
        type: formData.type,
        hzbnr: formData.hzbnr.trim() || undefined,
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        detailUrl: formData.detailUrl.trim(),
      });
      handleDialogClose();
    } catch (error) {
      console.error('Save failed:', error);
      alert(
        `Speichern fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setSaving(false);
    }
  }, [editingSlug, formData, handleDialogClose]);

  const handleMapConfirm = useCallback((lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
  }, []);

  const isFormValid =
    (editingSlug || formData.slug.trim()) &&
    formData.name.trim() &&
    formData.lat &&
    formData.lng &&
    !isNaN(parseFloat(formData.lat)) &&
    !isNaN(parseFloat(formData.lng));

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h5">Pegelstand Stationen</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={
              importing ? <CircularProgress size={20} /> : <UploadIcon />
            }
            onClick={handleImport}
            disabled={importing}
          >
            Import von OGC API
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
          >
            Hinzufügen
          </Button>
        </Box>
      </Box>

      {importMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setImportMessage(null)}>
          {importMessage}
        </Alert>
      )}
      {importError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportError(null)}>
          {importError}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Slug</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Typ</TableCell>
              <TableCell>HZBNR</TableCell>
              <TableCell>Lat</TableCell>
              <TableCell>Lng</TableCell>
              <TableCell>Aktionen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" sx={{ py: 2 }}>
                    Keine Stationen vorhanden. Importieren Sie Stationen über
                    die OGC API.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              stations.map((station) => (
                <TableRow key={station.id}>
                  <TableCell>{station.id}</TableCell>
                  <TableCell>{station.name}</TableCell>
                  <TableCell>
                    {station.type === 'river' ? 'Fluss' : 'See'}
                  </TableCell>
                  <TableCell>{station.hzbnr || '-'}</TableCell>
                  <TableCell>{station.lat.toFixed(4)}</TableCell>
                  <TableCell>{station.lng.toFixed(4)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(station)}
                      title="Bearbeiten"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(station)}
                      title="Löschen"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingSlug ? 'Station bearbeiten' : 'Neue Station'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {!editingSlug && (
              <TextField
                label="Slug"
                value={formData.slug}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, slug: e.target.value }))
                }
                helperText="z.B. 'burg' — muss dem URL-Pfad entsprechen"
                required
                fullWidth
              />
            )}
            {editingSlug && (
              <TextField
                label="Slug"
                value={formData.slug}
                disabled
                fullWidth
              />
            )}
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              required
              fullWidth
            />
            <TextField
              label="Typ"
              value={formData.type}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  type: e.target.value as 'river' | 'lake',
                }))
              }
              select
              fullWidth
            >
              <MenuItem value="river">Fluss</MenuItem>
              <MenuItem value="lake">See</MenuItem>
            </TextField>
            <TextField
              label="HZBNR"
              value={formData.hzbnr}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, hzbnr: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Detail URL"
              value={formData.detailUrl}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  detailUrl: e.target.value,
                }))
              }
              helperText="z.B. '/hydrographie/die-fluesse/burg'"
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                label="Lat"
                value={formData.lat}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, lat: e.target.value }))
                }
                type="number"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Lng"
                value={formData.lng}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, lng: e.target.value }))
                }
                type="number"
                sx={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                startIcon={<MapIcon />}
                onClick={() => setMapPickerOpen(true)}
                sx={{ mt: 1 }}
              >
                Karte
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>Abbrechen</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!isFormValid || saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Speichern'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Map Picker */}
      <LocationMapPicker
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        onConfirm={handleMapConfirm}
        initialLat={
          formData.lat && !isNaN(parseFloat(formData.lat))
            ? parseFloat(formData.lat)
            : undefined
        }
        initialLng={
          formData.lng && !isNaN(parseFloat(formData.lng))
            ? parseFloat(formData.lng)
            : undefined
        }
      />
    </Box>
  );
}
