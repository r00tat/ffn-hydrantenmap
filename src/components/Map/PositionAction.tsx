import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import { useCallback, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { usePositionContext } from '../providers/PositionProvider';

export default function PositionAction() {
  const map = useMap();
  const [position, isPositionSet, , enableTracking, isPending] =
    usePositionContext();
  const pendingZoomRef = useRef(false);

  const setPos = useCallback(() => {
    if (isPositionSet) {
      map.setView(position);
    } else {
      pendingZoomRef.current = true;
      enableTracking();
    }
  }, [map, position, isPositionSet, enableTracking]);

  useEffect(() => {
    if (isPositionSet && pendingZoomRef.current) {
      pendingZoomRef.current = false;
      map.setView(position);
    }
  }, [map, position, isPositionSet]);

  const tooltip = isPending
    ? 'Position wird ermittelt …'
    : isPositionSet
      ? 'Zur aktuellen Position zoomen'
      : 'Position aktivieren';

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 64,
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
