'use client';

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import useVehicles from '../../hooks/useVehicles';
import { parentCandidates } from '../pages/unit-tree';

/**
 * Taktische Einheit eines Fahrzeugs oder die übergeordnete Einheit einer
 * Einheit (Zug unter Bereitschaft). Einer Einheit fehlen sie selbst und alles
 * unter ihr in der Auswahl, sonst entstünde ein Zyklus. Nur sichtbar, wenn es
 * etwas zur Auswahl gibt — sonst wäre es ein leeres Feld.
 */
export default function VehicleUnitSelect({
  itemId,
  isUnit = false,
  value,
  onChange,
}: {
  itemId?: string;
  isUnit?: boolean;
  value?: string;
  onChange: (unitId: string | undefined) => void;
}) {
  const t = useTranslations('einsatzmittel');
  const { tacticalUnits: allUnits } = useVehicles();
  const tacticalUnits = parentCandidates(itemId, allUnits);
  if (tacticalUnits.length === 0) return null;

  return (
    <TextField
      select
      fullWidth
      margin="dense"
      variant="standard"
      label={isUnit ? t('parentUnit') : t('cols.unit')}
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
