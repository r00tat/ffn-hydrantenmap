import React from 'react';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import { groupVehiclesByFw, OwnFleet } from '../../common/vehicleGroups';
import { Fzg } from '../firebase/firestore';

/**
 * Die Einträge eines Fahrzeug-Auswahlfelds: die eigenen Fahrzeuge zuerst,
 * danach die fremden je Feuerwehr unter einer Überschrift.
 *
 * Eine Funktion und keine Komponente, weil `Select` seine Kinder direkt
 * auswertet — ein Wrapper dazwischen ließe sich nicht mehr auswählen.
 * Überschriften gibt es nur, wenn überhaupt fremde Fahrzeuge da sind; sonst
 * bleibt die Liste, wie sie war.
 */
export function vehicleSelectItems(
  vehicles: Fzg[],
  fleet: OwnFleet,
  noFwLabel: string,
): React.ReactNode[] {
  const groups = groupVehiclesByFw(vehicles, fleet);
  const showHeaders = groups.some((g) => !g.own);
  return groups.flatMap((group) => [
    ...(showHeaders
      ? [
          <ListSubheader key={`fw:${group.key}`}>
            {group.label || noFwLabel}
          </ListSubheader>,
        ]
      : []),
    ...group.vehicles.map((v) => (
      <MenuItem key={v.id} value={v.id}>
        {v.name}
      </MenuItem>
    )),
  ]);
}
