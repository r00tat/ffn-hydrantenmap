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
import { RadiacodeDeviceRef, SampleRateSpec } from '../../hooks/radiacode/types';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import { useFirecallLayersSorted } from '../../hooks/useFirecallLayers';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { useRadiacode } from '../providers/RadiacodeProvider';
import { useGpsProvider } from '../providers/GpsProvider';
import { usePositionContext } from '../providers/PositionProvider';
import RadiacodeLiveWidget from './RadiacodeLiveWidget';
import TrackStartDialog, { TrackStartConfig } from './TrackStartDialog';

export default function RecordButton() {
  const [position, isPositionSet, , enableTracking, isPositionPending] =
    usePositionContext();
  const {
    isRecording,
    mode,
    layerId,
    sampleRate,
    startGpsRecording,
    startRadiacodeRecording,
    stopRecording,
  } = useGpsProvider();

  const sortedLayers = useFirecallLayersSorted();
  const addFirecallItem = useFirecallItemAdd();
  const firecallId = useFirecallId();
  const { email: creatorEmail } = useFirebaseLogin();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);
  const [defaultDevice, setDefaultDevice] = useState<RadiacodeDeviceRef | null>(
    null,
  );

  useEffect(() => {
    loadDefaultDevice().then(setDefaultDevice);
  }, []);

  // Automatically open the dialog once the position is available if the user
  // clicked the button while it was still pending.
  useEffect(() => {
    if (pendingDialogOpen && isPositionSet) {
      setTimeout(() => {
        setPendingDialogOpen(false);
        setDialogOpen(true);
      }, 0);
    } else if (pendingDialogOpen && !isPositionPending && !isPositionSet) {
      setTimeout(() => {
        setPendingDialogOpen(false);
      }, 0);
    }
  }, [isPositionSet, pendingDialogOpen, isPositionPending]);

  const {
    status: radiacodeStatus,
    scan,
    connectDevice,
  } = useRadiacode();

  const existingRadiacodeLayers = useMemo(
    () => sortedLayers.filter((l) => l.layerType === 'radiacode'),
    [sortedLayers],
  );

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
        await startGpsRecording(config.layer?.type === 'existing' ? config.layer.id : '', config.sampleRate);
        return;
      }
      // radiacode mode
      if (!config.device) return;
      let targetLayerId: string;
      if (config.layer?.type === 'new') {
        const layer = createRadiacodeLayer(config.layer.name);
        layer.sampleRate = config.sampleRate;
        const ref = await addFirecallItem(layer);
        targetLayerId = ref.id;
      } else if (config.layer?.type === 'existing') {
        targetLayerId = config.layer.id;
      } else {
        return;
      }

      try {
        await connectDevice(config.device);
        await startRadiacodeRecording(config.device, targetLayerId, config.sampleRate);
      } catch (err) {
        console.error('[RADIACODE] connect failed', err);
      }
    },
    [connectDevice, addFirecallItem, startGpsRecording, startRadiacodeRecording],
  );

  const handleStop = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (isRecording) {
        handleStop();
      } else if (!isPositionSet) {
        enableTracking();
        setPendingDialogOpen(true);
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
      <RadiacodeLiveWidget visible={isRecording && mode === 'radiacode'} />
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
