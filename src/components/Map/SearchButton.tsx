import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import { useCallback, useState } from 'react';
import { useMap } from 'react-leaflet';
import { defaultGeoPosition } from '../../common/geo';
import { OSMPlace, PlacesResponse } from '../../common/osm';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import InputDialog from '../dialogs/InputDialog';
import { FirecallItemMarker } from '../FirecallItems/elements/FirecallItemMarker';

function useSearchPlace() {
  const { isSignedIn, user, idToken: token } = useFirebaseLogin();
  return useCallback(
    async (query: string) => {
      if (!isSignedIn || !user) {
        return undefined;
      }
      const response = await fetch(`/api/places`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
        }),
      });
      const searchResult = await response.json();
      return searchResult;
    },
    [isSignedIn, token, user]
  );
}

function useAddPlace() {
  const addFirecallItem = useFirecallItemAdd();
  const map = useMap();
  return useCallback(
    async (query: string, place: OSMPlace) => {
      const m = new FirecallItemMarker({
        name: place.name || place.display_name || query,
        type: 'marker',
        lat: Number.parseFloat(place.lat) || defaultGeoPosition.lat,
        lng: Number.parseFloat(place.lon) || defaultGeoPosition.lng,
        beschreibung: `${place.name}\n${place.display_name}\n${place.licence}`,
      });

      const item = await addFirecallItem(m.data());
      console.info(`added ${item.id}`);

      map.panTo([m.lat, m.lng]);
    },
    [addFirecallItem, map]
  );
}

export default function SearchButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const searchPlace = useSearchPlace();
  const addPlace = useAddPlace();

  const handleClose = useCallback(
    async (value?: string) => {
      console.info('Close dialog', value);
      setIsDialogOpen(false);
      if (value) {
        const result: PlacesResponse = await searchPlace(value);
        console.info('Result', result);
        if (result.places?.[0]) {
          addPlace(value, result.places?.[0]);
        }
      }
    },
    [addPlace, searchPlace]
  );

  return (
    <>
      {isDialogOpen && (
        <InputDialog
          title="Search"
          onClose={handleClose}
          text="Adresssuche"
        ></InputDialog>
      )}
      <Box
        sx={{
          // '& > :not(style)': { m: 1 },
          position: 'absolute',
          bottom: 96,
          right: 16,
        }}
      >
        <Tooltip title="Nach einer Adresse suchen">
          <Fab
            color="default"
            aria-label="search"
            size="small"
            onClick={(event) => {
              event.preventDefault();
              console.info('Search for an address');
              setIsDialogOpen(true);
            }}
          >
            <SearchIcon />
          </Fab>
        </Tooltip>
      </Box>
    </>
  );
}
