import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import { useCallback } from 'react';
import { useMap } from 'react-leaflet';
import { usePositionContext } from './Position';

export default function PositionAction() {
  const map = useMap();
  const [position, isPositionSet, , enableTracking, isPending] =
    usePositionContext();

  const setPos = useCallback(() => {
    enableTracking();
    if (position && isPositionSet) {
      map.setView(position);
    }
  }, [map, position, isPositionSet, enableTracking]);

  const tooltip = isPending
    ? 'Position wird ermittelt …'
    : isPositionSet
      ? 'Zur aktuellen Position zoomen'
      : 'Position aktivieren';

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 24,
        left: 16,
      }}
    >
      <Tooltip title={tooltip}>
        <Fab
          color="primary"
          aria-label="locate"
          size="small"
          onClick={(event) => {
            event.preventDefault();
            setPos();
          }}
        >
          {isPending ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <LocationSearchingIcon />
          )}
        </Fab>
      </Tooltip>
    </Box>
  );
}
