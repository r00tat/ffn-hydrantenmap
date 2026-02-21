'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
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
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MapIcon from '@mui/icons-material/Map';
import DownloadIcon from '@mui/icons-material/Download';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import UploadIcon from '@mui/icons-material/Upload';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { PegelstandStation } from '../Map/layers/PegelstandLayer';
import {
  fetchOgcStations,
  importAllStations,
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

/** Parse a single CSV line, handling quoted fields with commas/quotes inside. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

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
  const [mapPickerStation, setMapPickerStation] = useState<PegelstandStation | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type SortKey = 'id' | 'name' | 'type' | 'hzbnr' | 'lat' | 'lng';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((key: SortKey) => {
    setSortDir((prev) => (sortKey === key && prev === 'asc' ? 'desc' : 'asc'));
    setSortKey(key);
  }, [sortKey]);

  const sortedStations = useMemo(() => {
    const sorted = [...stations].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortKey) {
        case 'lat':
        case 'lng':
          aVal = a[sortKey];
          bVal = b[sortKey];
          break;
        case 'id':
          aVal = a.id;
          bVal = b.id;
          break;
        case 'hzbnr':
          aVal = a.hzbnr || '';
          bVal = b.hzbnr || '';
          break;
        default:
          aVal = a[sortKey] || '';
          bVal = b[sortKey] || '';
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [stations, sortKey, sortDir]);

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

      const result = await importAllStations(ogcStations, scrapedSlugs);
      const parts = [
        `${result.total} Stationen importiert`,
        `${result.withCoordinates} mit Koordinaten`,
      ];
      if (result.fromDetailPages > 0) {
        parts.push(
          `davon ${result.fromDetailPages} von Detailseiten`
        );
      }
      if (result.withoutCoordinates > 0) {
        parts.push(`${result.withoutCoordinates} ohne Koordinaten`);
      }
      setImportMessage(parts.join(', '));
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

  const handleInlineMapConfirm = useCallback(
    async (lat: number, lng: number) => {
      if (!mapPickerStation) return;
      try {
        await savePegelstandStation(mapPickerStation.id, {
          name: mapPickerStation.name,
          type: mapPickerStation.type,
          hzbnr: mapPickerStation.hzbnr || undefined,
          lat,
          lng,
          detailUrl: mapPickerStation.detailUrl || '',
        });
      } catch (error) {
        console.error('Save failed:', error);
        alert(
          `Speichern fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      setMapPickerStation(null);
    },
    [mapPickerStation]
  );

  const handleExportCsv = useCallback(() => {
    const header = 'slug,name,type,hzbnr,lat,lng,detailUrl';
    const rows = stations.map((s) => {
      const escape = (v: string) =>
        v.includes(',') || v.includes('"') || v.includes('\n')
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      return [
        escape(s.id),
        escape(s.name),
        s.type,
        escape(s.hzbnr || ''),
        String(s.lat),
        String(s.lng),
        escape(s.detailUrl || ''),
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pegelstand_stations.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [stations]);

  const handleImportCsv = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so the same file can be re-selected
      e.target.value = '';

      setCsvImporting(true);
      setImportMessage(null);
      setImportError(null);

      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          setImportError('CSV ist leer oder enthält nur die Kopfzeile.');
          return;
        }

        // Parse header to find column indices
        const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const idx = {
          slug: header.indexOf('slug'),
          name: header.indexOf('name'),
          type: header.indexOf('type'),
          hzbnr: header.indexOf('hzbnr'),
          lat: header.indexOf('lat'),
          lng: header.indexOf('lng'),
          detailUrl: header.indexOf('detailurl'),
        };

        if (idx.slug === -1 || idx.name === -1) {
          setImportError(
            'CSV muss mindestens die Spalten "slug" und "name" enthalten.'
          );
          return;
        }

        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          const slug = cols[idx.slug]?.trim();
          const name = cols[idx.name]?.trim();
          if (!slug || !name) continue;

          await savePegelstandStation(slug, {
            name,
            type:
              idx.type !== -1 && cols[idx.type]?.trim() === 'lake'
                ? 'lake'
                : 'river',
            hzbnr:
              idx.hzbnr !== -1 ? cols[idx.hzbnr]?.trim() || undefined : undefined,
            lat: idx.lat !== -1 ? parseFloat(cols[idx.lat]) || 0 : 0,
            lng: idx.lng !== -1 ? parseFloat(cols[idx.lng]) || 0 : 0,
            detailUrl: idx.detailUrl !== -1 ? cols[idx.detailUrl]?.trim() || '' : '',
          });
          count++;
        }

        setImportMessage(`${count} Stationen aus CSV importiert.`);
      } catch (error) {
        console.error('CSV import failed:', error);
        setImportError(
          `CSV Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        setCsvImporting(false);
      }
    },
    []
  );

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
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCsv}
            disabled={stations.length === 0}
          >
            CSV Export
          </Button>
          <Button
            variant="outlined"
            startIcon={
              csvImporting ? <CircularProgress size={20} /> : <FileUploadIcon />
            }
            onClick={() => fileInputRef.current?.click()}
            disabled={csvImporting}
          >
            CSV Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            hidden
            onChange={handleImportCsv}
          />
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
              {([
                ['id', 'Slug'],
                ['name', 'Name'],
                ['type', 'Typ'],
                ['hzbnr', 'HZBNR'],
                ['lat', 'Lat'],
                ['lng', 'Lng'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableCell key={key} sortDirection={sortKey === key ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === key}
                    direction={sortKey === key ? sortDir : 'asc'}
                    onClick={() => handleSort(key)}
                  >
                    {label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell>Aktionen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" sx={{ py: 2 }}>
                    Keine Stationen vorhanden. Importieren Sie Stationen über
                    die OGC API.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedStations.map((station) => (
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
                      onClick={() => setMapPickerStation(station)}
                      title="Position auf Karte wählen"
                    >
                      <MapIcon fontSize="small" />
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

      {/* Map Picker for edit dialog */}
      <LocationMapPicker
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        onConfirm={handleMapConfirm}
        showFirecallLayers={false}
        title={`Position wählen: ${formData.name || ''}`}
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

      {/* Inline map picker for table row action */}
      <LocationMapPicker
        open={!!mapPickerStation}
        onClose={() => setMapPickerStation(null)}
        onConfirm={handleInlineMapConfirm}
        showFirecallLayers={false}
        title={`Position wählen: ${mapPickerStation?.name || ''}`}
        initialLat={
          mapPickerStation && mapPickerStation.lat
            ? mapPickerStation.lat
            : undefined
        }
        initialLng={
          mapPickerStation && mapPickerStation.lng
            ? mapPickerStation.lng
            : undefined
        }
      />
    </Box>
  );
}
