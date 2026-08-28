'use client';

import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FirecallMapLayer,
  MAP_OVERLAY_FORMATS,
  MapOverlayType,
  validateMapLayer,
} from '../../../common/mapLayers';
import type { WmsCapabilitiesLayer } from '../../../common/wmsCapabilities';
import { deriveMapLayerSettings } from '../../../common/mapLayerFromCapabilities';
import {
  loadWmsCapabilities,
  type WmsCapabilitiesResult,
} from '../../../app/actions/mapCapabilities';
import { DEFAULT_WMS_TILE_SIZE } from '../tiles';

export interface MapLayerDialogProps {
  /** Ohne Vorgabe wird eine neue Kartenebene angelegt. */
  layer?: FirecallMapLayer;
  onClose: (layer?: FirecallMapLayer) => void;
  /**
   * Löschen aus dem Dialog heraus. Ohne die Angabe fehlt der Knopf.
   *
   * Wer eine Ebene öffnet, um sie zu prüfen, entscheidet oft erst dort, dass
   * sie weg soll — den Dialog dafür erst zu schließen und in der Liste den
   * richtigen Eintrag wiederzufinden, ist ein unnötiger Umweg. Die Abfrage
   * stellt der Aufrufer, nicht dieser Dialog.
   */
  onDelete?: () => void;
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
  onDelete,
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
  const [capabilities, setCapabilities] =
    useState<WmsCapabilitiesResult | null>(null);
  /** Layer, die der Dienst führt, aber nicht in EPSG:3857 liefert. */
  const [unsupportedCrs, setUnsupportedCrs] = useState<string[]>([]);
  // Stabil halten: die Liste hängt an mehreren `useMemo`, ein jedes Mal neues
  // Array liesse sie bei jedem Tastendruck im Formular neu rechnen.
  const capabilitiesLayers: WmsCapabilitiesLayer[] = useMemo(
    () => capabilities?.layers ?? [],
    [capabilities]
  );

  const errors = useMemo(() => validateMapLayer(layer), [layer]);
  const isWms = layer.overlayType === 'WMS';

  /**
   * Was der Dienst an Bildformaten anbietet — und nur das. Ohne Auskunft
   * bleiben die zwei, die jeder WMS kann. Der gerade gesetzte Wert steht
   * immer mit in der Liste, sonst zeigte das Feld nichts an.
   */
  const formatChoices = useMemo(() => {
    const offered = (capabilities?.formats ?? []).filter((f) =>
      f.startsWith('image/')
    );
    const base = offered.length > 0 ? offered : [...MAP_OVERLAY_FORMATS];
    const current = layer.format;
    return current && !base.includes(current) ? [current, ...base] : base;
  }, [capabilities, layer.format]);

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

  /**
   * Die Auswahl auf die Einstellungen abbilden.
   *
   * Ein Layer auszuwählen ist eine ausdrückliche Handlung — was der Dienst über
   * ihn sagt, überschreibt deshalb, was vorher im Formular stand. Alle Felder
   * bleiben sichtbar und änderbar.
   */
  const applySelection = useCallback(
    (names: string[], source: WmsCapabilitiesResult) => {
      const selected = names
        .map((name) => source.layers.find((l) => l.name === name))
        .filter((l): l is WmsCapabilitiesLayer => !!l);
      const { settings, unsupportedCrs: unsupported } = deriveMapLayerSettings(
        selected,
        source
      );
      setUnsupportedCrs(unsupported);
      setLayer((prev) => ({
        ...prev,
        ...settings,
        // Einen selbst vergebenen Namen nicht überschreiben.
        name: prev.name || settings.name,
      }));
    },
    []
  );

  /**
   * Wohin die Abfrage geht.
   *
   * Die eingegebene Capabilities-Adresse, sonst die Dienst-URL. Beides kann
   * auseinanderfallen: nach der ersten Abfrage steht in `url` die vom Dienst
   * genannte GetMap-Adresse, und die beantwortet nicht überall auch ein
   * `GetCapabilities`.
   */
  const capabilitiesSource = (layer.capabilitiesUrl ?? '').trim() || layer.url;

  const loadCapabilities = useCallback(
    async (source: string, { silent = false } = {}) => {
      if (!source) return;
      setCapabilitiesLoading(true);
      setCapabilitiesError(null);
      setCapabilities(null);
      setUnsupportedCrs([]);
      try {
        const result = await loadWmsCapabilities(source);
        if (result.error) {
          // Beim stillen Nachladen einer bestehenden Ebene ist ein Fehlschlag
          // keine Warnung wert: bearbeitet werden soll sie trotzdem.
          if (!silent) setCapabilitiesError(t(`capabilities.${result.error}`));
          return;
        }
        setCapabilities(result);
        setLayer((prev) => ({
          ...prev,
          url: result.serviceUrl || prev.url,
          capabilitiesUrl: source,
        }));
        // Führt der Dienst genau einen Layer, gibt es nichts auszuwählen.
        // Beim Nachladen bleibt stehen, was gespeichert ist — sonst überschriebe
        // das bloße Öffnen des Dialogs von Hand geänderte Einstellungen.
        if (!silent && result.layers.length === 1) {
          applySelection([result.layers[0].name], result);
        }
      } catch (err) {
        console.error('GetCapabilities fehlgeschlagen', err);
        if (!silent) setCapabilitiesError(t('capabilities.unreachable'));
      } finally {
        setCapabilitiesLoading(false);
      }
    },
    [applySelection, t]
  );

  /**
   * Beim Bearbeiten den Dienst gleich abfragen.
   *
   * Ohne das steht die Layer-Auswahl beim zweiten Öffnen leer da: die Liste der
   * Layer kommt nur aus dem Capabilities, gespeichert ist bloß der
   * `LAYERS`-Wert. Die Auswahl ließe sich dann nicht mehr ändern, ohne erst
   * wieder von Hand abzufragen. Läuft genau einmal.
   */
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current) return;
    if (!existing?.id || existing.overlayType !== 'WMS') return;
    const source = (existing.capabilitiesUrl ?? '').trim() || existing.url;
    if (!source) return;
    autoLoaded.current = true;
    void loadCapabilities(source, { silent: true });
  }, [existing, loadCapabilities]);

  const selectedCapabilityLayers = useMemo(
    () =>
      (layer.wmsLayers ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    [layer.wmsLayers]
  );

  /**
   * Dieselbe Auswahl als Objekte für das Autocomplete.
   *
   * Ein gespeicherter Name, den der Dienst nicht (mehr) führt, fällt hier
   * heraus — im Feld `LAYERS` darunter steht er weiterhin und bleibt
   * änderbar.
   */
  const selectedCapabilityOptions = useMemo(
    () =>
      selectedCapabilityLayers
        .map((name) => capabilitiesLayers.find((l) => l.name === name))
        .filter((l): l is WmsCapabilitiesLayer => !!l),
    [capabilitiesLayers, selectedCapabilityLayers]
  );

  const onCapabilitySelect = useCallback(
    (names: string[]) => {
      if (capabilities) applySelection(names, capabilities);
    },
    [applySelection, capabilities]
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
          <TextField
            margin="dense"
            variant="standard"
            fullWidth
            label={t('fields.capabilitiesUrl')}
            value={layer.capabilitiesUrl ?? ''}
            onChange={(e) => setField('capabilitiesUrl', e.target.value)}
            helperText={t('help.capabilitiesUrl')}
          />
        )}

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
              disabled={capabilitiesLoading || !capabilitiesSource}
              onClick={() => loadCapabilities(capabilitiesSource)}
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
              /*
               * Eine Auswahlliste, kein `Select`: ein Dienst kann Dutzende
               * Layer führen (der INSPIRE-Dienst des Bundes 64), und in einer
               * Liste dieser Länge findet man weder den gesuchten Eintrag noch
               * sieht man, dass sich mehrere anhaken lassen. Das Autocomplete
               * filtert beim Tippen, hakt sichtbar an und behält die Liste beim
               * Anklicken offen.
               */
              <Autocomplete
                multiple
                disableCloseOnSelect
                openOnFocus
                limitTags={4}
                id="map-layer-capabilities"
                options={capabilitiesLayers}
                value={selectedCapabilityOptions}
                getOptionLabel={(option) => `${option.title} (${option.name})`}
                isOptionEqualToValue={(option, value) =>
                  option.name === value.name
                }
                onChange={(_event, values) =>
                  onCapabilitySelect(values.map((value) => value.name))
                }
                renderOption={({ key, ...props }, option, { selected }) => (
                  <Box
                    component="li"
                    key={key}
                    {...props}
                    // Die Verschachtelung des Dienstes bleibt ablesbar.
                    sx={{ pl: 1 + option.depth * 2 }}
                  >
                    <Checkbox size="small" checked={selected} sx={{ mr: 1 }} />
                    <ListItemText
                      primary={option.title}
                      secondary={option.name}
                    />
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="standard"
                    margin="dense"
                    label={t('capabilities.select')}
                    placeholder={t('capabilities.filter')}
                    helperText={`${t('capabilities.found', {
                      count: capabilitiesLayers.length,
                    })} — ${t('capabilities.multiHint')}`}
                  />
                )}
              />
            )}
            {unsupportedCrs.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {t('capabilities.unsupportedCrs', {
                  layers: unsupportedCrs.join(', '),
                })}
              </Alert>
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
                {formatChoices.map((format) => (
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

        {isWms && (
          <FormControl fullWidth variant="standard" margin="dense">
            <InputLabel id="map-layer-tilesize-label">
              {t('fields.tileSize')}
            </InputLabel>
            <Select
              labelId="map-layer-tilesize-label"
              id="map-layer-tilesize"
              value={layer.tileSize ?? DEFAULT_WMS_TILE_SIZE}
              label={t('fields.tileSize')}
              onChange={(e) => setField('tileSize', Number(e.target.value))}
            >
              {[256, 512, 1024].map((size) => (
                <MenuItem key={size} value={size}>
                  {size}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{t('help.tileSize')}</FormHelperText>
          </FormControl>
        )}

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
        {existing?.id && onDelete && (
          <Button
            color="error"
            startIcon={<DeleteIcon />}
            onClick={onDelete}
            sx={{ mr: 'auto' }}
          >
            {tc('delete')}
          </Button>
        )}
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
