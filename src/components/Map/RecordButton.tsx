import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useGpsLineRecorder } from '../../hooks/recording/useGpsLineRecorder';
import { usePositionContext } from './Position';

export default function RecordButton() {
  const [position, isPositionSet] = usePositionContext();
  const { isRecording, startRecording, stopRecording } = useGpsLineRecorder();

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 96,
        left: 16,
      }}
    >
      {isPositionSet && (
        <Tooltip title="GPS Track aufzeichnen">
          <Fab
            color={isRecording ? 'warning' : 'default'}
            aria-label="add"
            size="small"
            onClick={(event) => {
              event.preventDefault();
              if (isRecording) {
                stopRecording(L.latLng(position));
              } else {
                startRecording(L.latLng(position));
              }
            }}
          >
            <RadioButtonCheckedIcon />
          </Fab>
        </Tooltip>
      )}
    </Box>
  );
}
