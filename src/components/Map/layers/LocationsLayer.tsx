'use client';

import EditIcon from '@mui/icons-material/Edit';
import InfoIcon from '@mui/icons-material/Info';
import ListIcon from '@mui/icons-material/List';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import L from 'leaflet';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { LayerGroup, useMap } from 'react-leaflet';
import useFirecallLocations from '../../../hooks/useFirecallLocations';
import EinsatzortEditDialog from '../../Einsatzorte/EinsatzortEditDialog';
import FirecallElement from '../../FirecallItems/elements/FirecallElement';
import { FirecallItem, FirecallLocation } from '../../firebase/firestore';

export default function LocationsLayer() {
  const { locations } = useFirecallLocations();
  const router = useRouter();
  const map = useMap();

  const [contextMenuPos, setContextMenuPos] = useState<{
    top: number;
    left: number;
  }>();
  const [contextItem, setContextItem] = useState<FirecallItem>();
  const [editLocation, setEditLocation] = useState<FirecallLocation>();

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

  const openLocationEditor = useCallback(
    (item: FirecallItem) => {
      const loc = locations.find((l) => l.id === item.id);
      if (loc) setEditLocation(loc);
    },
    [locations]
  );

  const openEditFromMenu = useCallback(() => {
    if (contextItem) openLocationEditor(contextItem);
    closeContextMenu();
  }, [contextItem, openLocationEditor, closeContextMenu]);

  return (
    <LayerGroup>
      {locations
        .filter((loc) => loc.lat && loc.lng)
        .map((location) => (
          <FirecallElement
            item={
              {
                ...location,
                type: 'location',
                draggable: false,
              } as FirecallItem
            }
            selectItem={openLocationEditor}
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
        <MenuItem onClick={openEditFromMenu}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Bearbeiten</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextItem?.lat && contextItem?.lng) {
              const description = (contextItem as FirecallItem & { beschreibung?: string; description?: string }).beschreibung || (contextItem as FirecallItem & { description?: string }).description || '';
              map.openPopup(
                `<b>${contextItem.name}</b><br/>${description.replace(/\n/g, '<br/>')}`,
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
      <EinsatzortEditDialog
        location={editLocation}
        onClose={() => setEditLocation(undefined)}
      />
    </LayerGroup>
  );
}
