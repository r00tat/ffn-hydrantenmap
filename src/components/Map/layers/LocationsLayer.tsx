'use client';

import InfoIcon from '@mui/icons-material/Info';
import ListIcon from '@mui/icons-material/List';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import L from 'leaflet';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { LayerGroup, useMap } from 'react-leaflet';
import useFirecallLocations from '../../../hooks/useFirecallLocations';
import FirecallElement from '../../FirecallItems/elements/FirecallElement';
import { FcMarker, FirecallItem, LOCATION_STATUS_COLORS, LocationStatus } from '../../firebase/firestore';

export default function LocationsLayer() {
  const { locations } = useFirecallLocations();
  const router = useRouter();
  const map = useMap();

  const [contextMenuPos, setContextMenuPos] = useState<{
    top: number;
    left: number;
  }>();
  const [contextItem, setContextItem] = useState<FirecallItem>();

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(undefined);
    setContextItem(undefined);
  }, []);

  const handleContextMenu = useCallback(
    (item: FirecallItem, event: L.LeafletMouseEvent) => {
      setContextItem(item);
      setContextMenuPos({
        top: event.originalEvent.clientY,
        left: event.originalEvent.clientX,
      });
    },
    []
  );

  return (
    <LayerGroup>
      {locations
        .filter((loc) => loc.lat && loc.lng)
        .map((location) => (
          <FirecallElement
            item={
              {
                ...location,
                name: location.name || `${location.street} ${location.number}`.trim(),
                type: 'marker',
                color: LOCATION_STATUS_COLORS[location.status as LocationStatus] || 'red',
                beschreibung: [
                  `${location.street} ${location.number}, ${location.city}`,
                  location.vehicles && typeof location.vehicles === 'object'
                    ? `Fahrzeuge: ${Object.values(location.vehicles).join(', ')}`
                    : location.vehicles && `Fahrzeuge: ${location.vehicles}`,
                  location.description,
                ].filter(Boolean).join('\n'),
                draggable: false,
              } as FcMarker
            }
            selectItem={() => {}}
            key={location.id}
            options={{ onContextMenu: handleContextMenu }}
          />
        ))}
      <Menu
        open={!!contextMenuPos}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenuPos}
        slotProps={{ list: { dense: true } }}
      >
        <MenuItem
          onClick={() => {
            if (contextItem?.lat && contextItem?.lng) {
              map.openPopup(
                `<b>${contextItem.name}</b><br/>${(contextItem.beschreibung || '').replace(/\n/g, '<br/>')}`,
                L.latLng(contextItem.lat, contextItem.lng)
              );
            }
            closeContextMenu();
          }}
        >
          <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Details anzeigen</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            router.push('/einsatzorte');
            closeContextMenu();
          }}
        >
          <ListItemIcon><ListIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Einsatzorte</ListItemText>
        </MenuItem>
      </Menu>
    </LayerGroup>
  );
}
