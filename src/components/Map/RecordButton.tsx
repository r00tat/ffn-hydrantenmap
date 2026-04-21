import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGpsLineRecorder } from '../../hooks/recording/useGpsLineRecorder';
import { useRadiacodePointRecorder } from '../../hooks/recording/useRadiacodePointRecorder';
import { loadDefaultDevice } from '../../hooks/radiacode/devicePreference';
import { createRadiacodeLayer } from '../../hooks/radiacode/layerFactory';
import { RadiacodeDeviceRef, SampleRate } from '../../hooks/radiacode/types';
import { useFirecallLayersSorted } from '../../hooks/useFirecallLayers';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { useRadiacode } from '../providers/RadiacodeProvider';
import { usePositionContext } from './Position';
import RadiacodeLiveWidget from './RadiacodeLiveWidget';
import TrackStartDialog, { TrackStartConfig } from './TrackStartDialog';

export default function RecordButton() {
  const [position, isPositionSet, , enableTracking, isPositionPending] =
    usePositionContext();
  const sortedLayers = useFirecallLayersSorted();
  const addFirecallItem = useFirecallItemAdd();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [radiacodeActive, setRadiacodeActive] = useState(false);
  const [radiacodeLayerId, setRadiacodeLayerId] = useState<string | null>(null);
  const [radiacodeSampleRate, setRadiacodeSampleRate] =
    useState<SampleRate>('normal');
  const [defaultDevice, setDefaultDevice] = useState<RadiacodeDeviceRef | null>(
    null,
  );

  useEffect(() => {
    loadDefaultDevice().then(setDefaultDevice);
  }, []);

  const gps = useGpsLineRecorder();

  const {
    status: radiacodeStatus,
    measurement,
    device,
    scan,
    connectDevice,
    disconnect,
    startForegroundService,
    stopForegroundService,
  } = useRadiacode();

  useRadiacodePointRecorder({
    active: radiacodeActive,
    layerId: radiacodeLayerId ?? '',
    sampleRate: radiacodeSampleRate,
    device,
    measurement,
    position: isPositionSet ? { lat: position.lat, lng: position.lng } : null,
    addItem: addFirecallItem,
    onStart: useCallback(
      () =>
        startForegroundService?.({
          title: 'Strahlenmessung läuft',
          body: 'Live-Messpunkte werden aufgezeichnet',
        }) ?? Promise.resolve(),
      [startForegroundService],
    ),
    onStop: useCallback(
      () => stopForegroundService?.() ?? Promise.resolve(),
      [stopForegroundService],
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
        await connectDevice(config.device);
        setRadiacodeActive(true);
      } catch (err) {
        console.error('[RADIACODE] connect failed', err);
      }
    },
    [gps, position, connectDevice, addFirecallItem],
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
      } else if (!isPositionSet) {
        enableTracking();
      } else {
        setDialogOpen(true);
      }
    },
    [isRecording, isPositionSet, enableTracking, handleStop],
  );

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          bottom: 120,
          left: 16,
        }}
      >
        <Tooltip
          title={
            isPositionPending
              ? 'Position wird ermittelt …'
              : !isPositionSet
                ? 'Position aktivieren, um Aufzeichnung zu starten'
                : 'Aufzeichnung'
          }
        >
          <Fab
            color={isRecording ? 'warning' : 'default'}
            aria-label="add"
            size="small"
            onClick={handleClick}
          >
            <RadioButtonCheckedIcon />
          </Fab>
        </Tooltip>
      </Box>
      <RadiacodeLiveWidget visible={radiacodeActive} />
      <TrackStartDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onStart={handleStart}
        existingRadiacodeLayers={existingRadiacodeLayers}
        defaultDevice={defaultDevice}
        onRequestDevice={handleRequestDevice}
        radiacodeStatus={radiacodeStatus}
      />
    </>
  );
}
