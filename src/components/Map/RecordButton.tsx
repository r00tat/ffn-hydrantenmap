import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGpsLineRecorder } from '../../hooks/recording/useGpsLineRecorder';
import { useRadiacodePointRecorder } from '../../hooks/recording/useRadiacodePointRecorder';
import { BleAdapter, getBleAdapter } from '../../hooks/radiacode/bleAdapter';
import {
  loadDefaultDevice,
  saveDefaultDevice,
} from '../../hooks/radiacode/devicePreference';
import { createRadiacodeLayer } from '../../hooks/radiacode/layerFactory';
import {
  RadiacodeDeviceRef,
  SampleRate,
} from '../../hooks/radiacode/types';
import { useRadiacodeDevice } from '../../hooks/radiacode/useRadiacodeDevice';
import { useFirecallLayersSorted } from '../../hooks/useFirecallLayers';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { usePositionContext } from './Position';
import RadiacodeLiveWidget from './RadiacodeLiveWidget';
import TrackStartDialog, {
  TrackStartConfig,
} from './TrackStartDialog';

const NULL_ADAPTER: BleAdapter = {
  isSupported: () => false,
  requestDevice: async () => {
    throw new Error('BLE adapter not initialized');
  },
  connect: async () => {
    throw new Error('BLE adapter not initialized');
  },
  disconnect: async () => {},
  onNotification: async () => () => {},
  write: async () => {},
};

export default function RecordButton() {
  const [position, isPositionSet] = usePositionContext();
  const sortedLayers = useFirecallLayersSorted();
  const addFirecallItem = useFirecallItemAdd();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [radiacodeActive, setRadiacodeActive] = useState(false);
  const [radiacodeLayerId, setRadiacodeLayerId] = useState<string | null>(null);
  const [radiacodeSampleRate, setRadiacodeSampleRate] =
    useState<SampleRate>('normal');
  const [defaultDevice, setDefaultDevice] =
    useState<RadiacodeDeviceRef | null>(null);

  const [adapter, setAdapter] = useState<BleAdapter>(NULL_ADAPTER);
  useEffect(() => {
    getBleAdapter().then(setAdapter);
  }, []);

  useEffect(() => {
    loadDefaultDevice().then(setDefaultDevice);
  }, []);

  const gps = useGpsLineRecorder();

  const { measurement, scan, connect, disconnect, device } =
    useRadiacodeDevice(adapter);

  useRadiacodePointRecorder({
    active: radiacodeActive,
    layerId: radiacodeLayerId ?? '',
    sampleRate: radiacodeSampleRate,
    device,
    measurement,
    position: isPositionSet
      ? { lat: position.lat, lng: position.lng }
      : null,
    addItem: addFirecallItem,
    onStart: useCallback(
      () =>
        adapter.startForegroundService?.({
          title: 'Strahlenmessung läuft',
          body: 'Live-Messpunkte werden aufgezeichnet',
        }) ?? Promise.resolve(),
      [adapter],
    ),
    onStop: useCallback(
      () => adapter.stopForegroundService?.() ?? Promise.resolve(),
      [adapter],
    ),
  });

  const existingRadiacodeLayers = useMemo(
    () => sortedLayers.filter((l) => l.layerType === 'radiacode'),
    [sortedLayers],
  );

  const isRecording = gps.isRecording || radiacodeActive;

  const handleRequestDevice = useCallback(async () => {
    const scanned = await scan();
    if (scanned) {
      setDefaultDevice(scanned);
      await saveDefaultDevice(scanned);
    }
  }, [scan]);

  const handleStart = useCallback(
    async (config: TrackStartConfig) => {
      setDialogOpen(false);
      if (config.mode === 'gps') {
        gps.startRecording(L.latLng(position));
        return;
      }
      // radiacode mode
      if (!config.device) return;
      let layerId: string;
      if (config.layer?.type === 'new') {
        const layer = createRadiacodeLayer(config.layer.name);
        layer.sampleRate = config.sampleRate;
        const ref = await addFirecallItem(layer);
        layerId = ref.id;
      } else if (config.layer?.type === 'existing') {
        layerId = config.layer.id;
      } else {
        return;
      }
      setRadiacodeLayerId(layerId);
      setRadiacodeSampleRate(config.sampleRate);
      try {
        await connect(config.device);
        setRadiacodeActive(true);
      } catch (err) {
        console.error('[RADIACODE] connect failed', err);
      }
    },
    [gps, position, connect, addFirecallItem],
  );

  const handleStop = useCallback(async () => {
    if (gps.isRecording) {
      gps.stopRecording(L.latLng(position));
    }
    if (radiacodeActive) {
      setRadiacodeActive(false);
      setRadiacodeLayerId(null);
      await disconnect();
    }
  }, [gps, position, radiacodeActive, disconnect]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (isRecording) {
        handleStop();
      } else {
        setDialogOpen(true);
      }
    },
    [isRecording, handleStop],
  );

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          bottom: 96,
          left: 16,
        }}
      >
        {isPositionSet && (
          <Tooltip title="Aufzeichnung">
            <Fab
              color={isRecording ? 'warning' : 'default'}
              aria-label="add"
              size="small"
              onClick={handleClick}
            >
              <RadioButtonCheckedIcon />
            </Fab>
          </Tooltip>
        )}
      </Box>
      <RadiacodeLiveWidget visible={radiacodeActive} />
      <TrackStartDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onStart={handleStart}
        existingRadiacodeLayers={existingRadiacodeLayers}
        defaultDevice={defaultDevice}
        onRequestDevice={handleRequestDevice}
      />
    </>
  );
}
