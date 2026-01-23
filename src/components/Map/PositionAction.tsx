import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import { useCallback } from 'react';
import { useMap } from 'react-leaflet';
import { usePositionContext } from './Position';

export default function PositionAction() {
  const map = useMap();
  const [position, isPositionSet, , enableTracking] = usePositionContext();

  const setPos = useCallback(() => {
    enableTracking();
    if (position && isPositionSet) {
      map.setView(position);
    }
  }, [map, position, isPositionSet, enableTracking]);

  return (
    <Box
      sx={{
        // '& > :not(style)': { m: 1 },
        position: 'absolute',
        bottom: 24,
        left: 16,
      }}
    >
      <Tooltip
        title={
          isPositionSet
            ? 'Zur aktuellen Position zoomen'
            : 'Position aktivieren'
        }
      >
        <Fab
          color="primary"
          aria-label="locate"
          size="small"
          onClick={(event) => {
            event.preventDefault();
            setPos();
          }}
        >
          <LocationSearchingIcon />
        </Fab>
      </Tooltip>
    </Box>
  );
}
