'use client';

import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import MapIcon from '@mui/icons-material/Map';
import { CollectionConfig } from './clusterItemConfig';
import { saveClusterItem } from '../../app/admin/ClusterItemAdminAction';
import LocationMapPicker from '../Einsatzorte/LocationMapPicker';

interface ClusterItemEditDialogProps {
  open: boolean;
  onClose: () => void;
  config: CollectionConfig;
  editingId: string | null;
  initialData: Record<string, string>;
}

export default function ClusterItemEditDialog({
  open,
  onClose,
  config,
  editingId,
  initialData,
}: ClusterItemEditDialogProps) {
  const t = useTranslations('admin.cluster');
  const tCommon = useTranslations('common');
  const [formData, setFormData] = useState<Record<string, string>>(initialData);
  const [saving, setSaving] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  const handleChange = useCallback((key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleMapConfirm = useCallback((lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const data: Record<string, unknown> = {};

      // Process fields based on config
      for (const field of config.fields) {
        const value = formData[field.key]?.trim() ?? '';
        if (field.type === 'number' && value !== '') {
          data[field.key] = parseFloat(value);
        } else {
          data[field.key] = value;
        }
      }

      // Always include lat/lng
      data.lat = parseFloat(formData.lat || '0');
      data.lng = parseFloat(formData.lng || '0');

      await saveClusterItem(config.collection, editingId, data);
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
      alert(
        `Speichern fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setSaving(false);
    }
  }, [config, editingId, formData, onClose]);

  const isFormValid =
    formData.name?.trim() &&
    formData.lat &&
    formData.lng &&
    !isNaN(parseFloat(formData.lat)) &&
    !isNaN(parseFloat(formData.lng));

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId
            ? `${config.displayName.replace(/e$/, '').replace(/en$/, '')} bearbeiten`
            : `Neues Objekt (${config.displayName})`}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {editingId && (
              <TextField label="ID" value={editingId} disabled fullWidth />
            )}

            {config.fields.map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                value={formData[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                type={field.type === 'number' ? 'number' : 'text'}
                required={field.required}
                fullWidth
                multiline={field.type === 'textarea'}
                minRows={field.type === 'textarea' ? 3 : undefined}
                slotProps={field.type === 'date' ? { inputLabel: { shrink: true } } : undefined}
              />
            ))}

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                label="Lat"
                value={formData.lat || ''}
                onChange={(e) => handleChange('lat', e.target.value)}
                type="number"
                required
                sx={{ flex: 1 }}
              />
              <TextField
                label="Lng"
                value={formData.lng || ''}
                onChange={(e) => handleChange('lng', e.target.value)}
                type="number"
                required
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
          <Button onClick={onClose}>{tCommon('cancel')}</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!isFormValid || saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Speichern'}
          </Button>
        </DialogActions>
      </Dialog>

      <LocationMapPicker
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        onConfirm={handleMapConfirm}
        showFirecallLayers={false}
        title={t('pickPosition')}
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
    </>
  );
}
