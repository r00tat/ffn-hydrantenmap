'use client';

import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  FirecallMapLayer,
  MAP_OVERLAY_FORMATS,
  MapOverlayType,
  validateMapLayer,
} from '../../../common/mapLayers';
import type { WmsCapabilitiesLayer } from '../../../common/wmsCapabilities';
import { loadWmsCapabilities } from '../../../app/actions/mapCapabilities';

export interface MapLayerDialogProps {
  /** Ohne Vorgabe wird eine neue Kartenebene angelegt. */
  layer?: FirecallMapLayer;
  onClose: (layer?: FirecallMapLayer) => void;
}

const EMPTY_LAYER: FirecallMapLayer = {
  name: '',
  overlayType: 'WMS',
  url: '',
  transparent: true,
  opacity: 1,
  enabled: false,
};

/** Zahl aus einem Eingabefeld; leer bleibt leer statt 0 zu werden. */
function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function MapLayerDialog({
  layer: existing,
  onClose,
}: MapLayerDialogProps) {
  const t = useTranslations('mapLayers');
  const tc = useTranslations('common');
  const [layer, setLayer] = useState<FirecallMapLayer>({
    ...EMPTY_LAYER,
    ...existing,
  });
  const [showErrors, setShowErrors] = useState(false);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(
    null
  );
  const [capabilitiesLayers, setCapabilitiesLayers] = useState<
    WmsCapabilitiesLayer[]
  >([]);

  const errors = useMemo(() => validateMapLayer(layer), [layer]);
  const isWms = layer.overlayType === 'WMS';

  const setField = useCallback(
    <K extends keyof FirecallMapLayer>(
      field: K,
      value: FirecallMapLayer[K]
    ) => {
      setLayer((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const errorText = useCallback(
    (field: keyof typeof errors) =>
      showErrors && errors[field] ? t(`errors.${errors[field]}`) : undefined,
    [errors, showErrors, t]
  );

  const loadCapabilities = useCallback(async () => {
    setCapabilitiesLoading(true);
    setCapabilitiesError(null);
    setCapabilitiesLayers([]);
    try {
      const result = await loadWmsCapabilities(layer.url);
      if (result.error) {
        setCapabilitiesError(t(`capabilities.${result.error}`));
        return;
      }
      setCapabilitiesLayers(result.layers);
      setLayer((prev) => ({
        ...prev,
        url: result.serviceUrl || prev.url,
        name: prev.name || result.title || prev.name,
        // Ein Dienst, der kein PNG anbietet, kann nichts Transparentes
        // liefern — dann ist JPEG die einzige sinnvolle Wahl.
        format:
          prev.format ||
          (result.formats.includes('image/png')
            ? 'image/png'
            : result.formats[0]),
      }));
    } catch (err) {
      console.error('GetCapabilities fehlgeschlagen', err);
      setCapabilitiesError(t('capabilities.unreachable'));
    } finally {
      setCapabilitiesLoading(false);
    }
  }, [layer.url, t]);

  const selectedCapabilityLayers = useMemo(
    () =>
      (layer.wmsLayers ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    [layer.wmsLayers]
  );

  const onCapabilitySelect = useCallback(
    (names: string[]) => {
      setLayer((prev) => {
        const bounds =
          prev.bounds ||
          capabilitiesLayers.find((c) => c.name === names[0])?.bounds;
        return {
          ...prev,
          wmsLayers: names.join(','),
          ...(bounds ? { bounds } : {}),
        };
      });
    },
    [capabilitiesLayers]
  );

  const handleSave = useCallback(() => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    onClose(layer);
  }, [errors, layer, onClose]);

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={() => onClose()}>
      <DialogTitle sx={{ pr: 6 }}>
        {existing?.id ? t('editTitle') : t('addTitle')}
        <IconButton
          aria-label="close"
          onClick={() => onClose()}
          size="large"
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          margin="dense"
          variant="standard"
          fullWidth
          required
          label={t('fields.name')}
          value={layer.name}
          onChange={(e) => setField('name', e.target.value)}
          error={!!errorText('name')}
          helperText={errorText('name')}
        />

        <FormControl fullWidth variant="standard" margin="dense">
          <InputLabel id="map-layer-type-label">
            {t('fields.overlayType')}
          </InputLabel>
          <Select
            labelId="map-layer-type-label"
            id="map-layer-type"
            value={layer.overlayType}
            label={t('fields.overlayType')}
            onChange={(e) =>
              setField('overlayType', e.target.value as MapOverlayType)
            }
          >
            <MenuItem value="WMS">{t('types.WMS')}</MenuItem>
            <MenuItem value="WMTS">{t('types.WMTS')}</MenuItem>
          </Select>
        </FormControl>

        <TextField
          margin="dense"
          variant="standard"
          fullWidth
          required
          label={t('fields.url')}
          value={layer.url}
          onChange={(e) => setField('url', e.target.value)}
          error={!!errorText('url')}
          helperText={errorText('url') ?? t(isWms ? 'help.urlWms' : 'help.urlWmts')}
        />

        {isWms && (
          <Box sx={{ mt: 1 }}>
            <Button
              size="small"
              startIcon={
                capabilitiesLoading ? (
                  <CircularProgress size={16} />
                ) : (
                  <TravelExploreIcon />
                )
              }
              disabled={capabilitiesLoading || !layer.url}
              onClick={loadCapabilities}
            >
              {capabilitiesLoading
                ? t('capabilities.loading')
                : t('capabilities.load')}
            </Button>
            <Typography variant="caption" component="div" color="text.secondary">
              {t('capabilities.hint')}
            </Typography>
            {capabilitiesError && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {capabilitiesError}
              </Alert>
            )}
            {capabilitiesLayers.length > 0 && (
              <FormControl fullWidth variant="standard" margin="dense">
                <InputLabel id="map-layer-capabilities-label">
                  {t('capabilities.select')}
                </InputLabel>
                <Select
                  multiple
                  labelId="map-layer-capabilities-label"
                  id="map-layer-capabilities"
                  value={selectedCapabilityLayers}
                  label={t('capabilities.select')}
                  onChange={(e) =>
                    onCapabilitySelect(
                      typeof e.target.value === 'string'
                        ? e.target.value.split(',')
                        : e.target.value
                    )
                  }
                >
                  {capabilitiesLayers.map((c) => (
                    <MenuItem
                      key={c.name}
                      value={c.name}
                      sx={{ pl: 2 + c.depth * 2 }}
                    >
                      {c.title} ({c.name})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        )}

        {isWms && (
          <>
            <TextField
              margin="dense"
              variant="standard"
              fullWidth
              required
              label={t('fields.wmsLayers')}
              value={layer.wmsLayers ?? ''}
              onChange={(e) => setField('wmsLayers', e.target.value)}
              error={!!errorText('wmsLayers')}
              helperText={errorText('wmsLayers') ?? t('help.wmsLayers')}
            />
            <FormControl fullWidth variant="standard" margin="dense">
              <InputLabel id="map-layer-format-label">
                {t('fields.format')}
              </InputLabel>
              <Select
                labelId="map-layer-format-label"
                id="map-layer-format"
                value={layer.format ?? 'image/png'}
                label={t('fields.format')}
                onChange={(e) => setField('format', e.target.value)}
              >
                {MAP_OVERLAY_FORMATS.map((format) => (
                  <MenuItem key={format} value={format}>
                    {format}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={layer.transparent !== false}
                  onChange={(_, checked) => setField('transparent', checked)}
                />
              }
              label={t('fields.transparent')}
            />
          </>
        )}

        <Box sx={{ mt: 2 }}>
          <Typography id="map-layer-opacity-label" gutterBottom>
            {t('fields.opacity')}
          </Typography>
          <Slider
            aria-labelledby="map-layer-opacity-label"
            value={layer.opacity ?? 1}
            min={0}
            max={1}
            step={0.05}
            valueLabelDisplay="auto"
            marks={[
              { value: 0, label: '0' },
              { value: 0.5, label: '0,5' },
              { value: 1, label: '1' },
            ]}
            onChange={(_, value) => setField('opacity', value as number)}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            margin="dense"
            variant="standard"
            type="number"
            label={t('fields.maxZoom')}
            value={layer.maxZoom ?? ''}
            onChange={(e) => setField('maxZoom', toNumber(e.target.value))}
          />
          <TextField
            margin="dense"
            variant="standard"
            type="number"
            label={t('fields.maxNativeZoom')}
            value={layer.maxNativeZoom ?? ''}
            onChange={(e) =>
              setField('maxNativeZoom', toNumber(e.target.value))
            }
          />
          <TextField
            margin="dense"
            variant="standard"
            type="number"
            label={t('fields.zIndex')}
            value={layer.zIndex ?? ''}
            onChange={(e) => setField('zIndex', toNumber(e.target.value))}
            helperText={t('help.zIndex')}
          />
        </Box>

        <TextField
          margin="dense"
          variant="standard"
          fullWidth
          label={t('fields.bounds')}
          value={layer.bounds ?? ''}
          onChange={(e) => setField('bounds', e.target.value)}
          error={!!errorText('bounds')}
          helperText={errorText('bounds') ?? t('help.bounds')}
        />

        <TextField
          margin="dense"
          variant="standard"
          fullWidth
          label={t('fields.attribution')}
          value={layer.attribution ?? ''}
          onChange={(e) => setField('attribution', e.target.value)}
          helperText={t('help.attribution')}
        />

        <TextField
          margin="dense"
          variant="standard"
          fullWidth
          multiline
          label={t('fields.beschreibung')}
          value={layer.beschreibung ?? ''}
          onChange={(e) => setField('beschreibung', e.target.value)}
        />

        <FormControlLabel
          control={
            <Switch
              checked={layer.enabled === true}
              onChange={(_, checked) => setField('enabled', checked)}
            />
          }
          label={t('fields.enabled')}
        />

        <Alert severity="info" sx={{ mt: 2 }}>
          {t('offlineHint')}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>{tc('cancel')}</Button>
        <Button
          variant="contained"
          startIcon={existing?.id ? <SaveIcon /> : <AddIcon />}
          onClick={handleSave}
        >
          {existing?.id ? tc('save') : tc('add')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
