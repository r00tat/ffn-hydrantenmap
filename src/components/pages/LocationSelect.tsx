'use client';

import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { FirecallLocation } from '../firebase/firestore';
import {
  AssignableItem,
  currentLocationId,
  locationLabel,
} from './location-assignment';

/**
 * Einsatzort eines Fahrzeugs oder einer Einheit — in der Stärketabelle und in
 * der Übersicht nach Einsatzort. Ein Einsatzmittel steht immer nur an einem
 * Einsatzort, deshalb eine Einfachauswahl; ein neuer Ort zieht es vom
 * bisherigen ab. Leer heißt: von jedem Einsatzort abziehen.
 */
export default function LocationSelect({
  item,
  locations,
  onAssign,
}: {
  item: AssignableItem;
  locations: FirecallLocation[];
  onAssign: (locationId: string) => void;
}) {
  const t = useTranslations('einsatzmittel');
  const selected = useMemo(
    () => currentLocationId(locations, item),
    [locations, item],
  );

  return (
    <Select
      displayEmpty
      variant="standard"
      size="small"
      value={selected}
      onChange={(e) => onAssign(e.target.value)}
      inputProps={{ 'aria-label': t('locationFor', { name: item.name }) }}
      sx={{ minWidth: 120, maxWidth: 240, fontSize: 'body2.fontSize' }}
    >
      <MenuItem value="">
        <Typography variant="body2" color="text.secondary" component="span">
          {t('noLocation')}
        </Typography>
      </MenuItem>
      {locations.map((l) => (
        <MenuItem key={l.id} value={l.id}>
          {locationLabel(l)}
        </MenuItem>
      ))}
    </Select>
  );
}
