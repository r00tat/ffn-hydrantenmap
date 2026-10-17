'use client';

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import useVehicles from '../../hooks/useVehicles';

/**
 * Taktische Einheit eines Fahrzeugs. Nur sichtbar, wenn der Einsatz Einheiten
 * hat — sonst wäre es ein leeres Feld ohne Auswahl.
 */
export default function VehicleUnitSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (unitId: string | undefined) => void;
}) {
  const t = useTranslations('einsatzmittel');
  const { tacticalUnits } = useVehicles();
  if (tacticalUnits.length === 0) return null;

  return (
    <TextField
      select
      fullWidth
      margin="dense"
      variant="standard"
      label={t('cols.unit')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <MenuItem value="">{t('noUnit')}</MenuItem>
      {tacticalUnits.map((u) => (
        <MenuItem key={u.id} value={u.id}>
          {u.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
