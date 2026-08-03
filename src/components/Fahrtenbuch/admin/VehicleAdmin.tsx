'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FUEL_TYPES,
  VEHICLE_PRESETS,
  type CounterDefinition,
  type FahrtenbuchVehicle,
  type FuelType,
  type VehiclePresetId,
} from '../../../common/fahrtenbuch';
import useFahrtenbuchVehicles from '../../../hooks/useFahrtenbuchVehicles';
import {
  deleteFahrtenbuchVehicle,
  saveFahrtenbuchVehicle,
} from '../stammdatenActions';
import VehicleImportDialog from './VehicleImportDialog';

const PRESET_IDS: VehiclePresetId[] = ['fahrzeug', 'boot', 'none'];

/**
 * Zähler werden über ihre IDs verglichen, nicht über `JSON.stringify` — die
 * Feldreihenfolge eines aus Firestore geladenen Zählers muss nicht der des
 * Presets entsprechen, ein Boot würde sonst als „Fahrzeug" erkannt und beim
 * Speichern auf einen Kilometerzähler zurückgesetzt.
 */
function countersKey(counters?: CounterDefinition[]): string {
  return (counters ?? [])
    .map((counter) => counter.id)
    .sort()
    .join('|');
}

function presetForCounters(
  counters?: CounterDefinition[],
): VehiclePresetId | undefined {
  const key = countersKey(counters);
  return PRESET_IDS.find((id) => countersKey(VEHICLE_PRESETS[id]) === key);
}

export default function VehicleAdmin({ groupId }: { groupId: string }) {
  const t = useTranslations('fahrtenbuch');
  const { vehicles } = useFahrtenbuchVehicles(groupId);
  const [editing, setEditing] = useState<FahrtenbuchVehicle | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [dialogError, setDialogError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [kennzeichen, setKennzeichen] = useState('');
  const [active, setActive] = useState(true);
  const [preset, setPreset] = useState<VehiclePresetId>('fahrzeug');
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);

  const openDialog = (vehicle?: FahrtenbuchVehicle) => {
    setEditing(vehicle ?? ({} as FahrtenbuchVehicle));
    setDialogError(undefined);
    setName(vehicle?.name ?? '');
    setKennzeichen(vehicle?.kennzeichen ?? '');
    setActive(vehicle?.active !== false);
    setFuelTypes(vehicle?.fuelTypes ?? []);
    // Ohne Fahrzeug ist die Zählerliste leer und würde auf „ohne Zähler"
    // passen — neue Fahrzeuge starten trotzdem als Straßenfahrzeug.
    setPreset(vehicle ? (presetForCounters(vehicle.counters) ?? 'fahrzeug') : 'fahrzeug');
  };

  // Abgeleitet, daher während des Renderns berechnet (kein Effekt).
  const countersAreCustom =
    !!editing?.id && presetForCounters(editing.counters) === undefined;
  const nextSortOrder =
    vehicles.reduce((max, v) => Math.max(max, v.sortOrder ?? 0), 0) + 1;

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveFahrtenbuchVehicle(groupId, editing?.id, {
        name,
        kennzeichen,
        active,
        counters: VEHICLE_PRESETS[preset],
        fuelTypes,
        kostenersatzVehicleId: editing?.kostenersatzVehicleId,
        // Importierte Fahrzeuge tragen die Kostenersatz-Werte (dreistellig) —
        // ein `vehicles.length + 1` würde jedes neue Fahrzeug vor die gesamte
        // Flotte sortieren.
        sortOrder: editing?.sortOrder ?? nextSortOrder,
      });
      if (!result.success) {
        // Dialog bleibt offen, damit die Eingaben nicht verloren gehen.
        setDialogError(t('errors.saveFailed', { message: result.error ?? '' }));
        return;
      }
      setEditing(null);
    } catch (err) {
      // Die Action fängt ihre eigenen Fehler ab — hier landet nur ein
      // Transportfehler (offline, 500, veraltete Deployment-ID). Ohne diesen
      // Zweig bliebe der Dialog kommentarlos stehen.
      setDialogError(t('errors.saveFailed', { message: (err as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (vehicle: FahrtenbuchVehicle) => {
    if (!vehicle.id) return;
    if (!window.confirm(t('admin.deleteVehicleConfirm'))) return;
    try {
      const result = await deleteFahrtenbuchVehicle(groupId, vehicle.id);
      if (!result.success) {
        setFeedback(t('admin.deleteFailed', { message: result.error ?? '' }));
      }
    } catch (err) {
      setFeedback(t('admin.deleteFailed', { message: (err as Error).message }));
    }
  };

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={() => openDialog()}>
          {t('admin.addVehicle')}
        </Button>
        <Button onClick={() => setImportOpen(true)}>
          {t('admin.importVehicles')}
        </Button>
      </Stack>

      {feedback && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFeedback(undefined)}>
          {feedback}
        </Alert>
      )}

      {vehicles.length === 0 ? (
        <Typography color="text.secondary">{t('admin.noVehicles')}</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.name')}</TableCell>
                <TableCell>{t('kennzeichen')}</TableCell>
                <TableCell>{t('admin.counters')}</TableCell>
                <TableCell>{t('admin.active')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {vehicles.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  <TableCell>{vehicle.name}</TableCell>
                  <TableCell>{vehicle.kennzeichen}</TableCell>
                  <TableCell>
                    {(vehicle.counters ?? [])
                      .map((def) =>
                        def.labelKey ? t(def.labelKey as 'counters.km') : def.label,
                      )
                      .join(', ')}
                  </TableCell>
                  <TableCell>{vehicle.active !== false ? '✓' : ''}</TableCell>
                  <TableCell align="right">
                    <Tooltip title={t('admin.editVehicle')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`${t('admin.editVehicle')}: ${vehicle.name}`}
                          onClick={() => openDialog(vehicle)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('admin.deleteVehicleConfirm')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`${t('admin.deleteVehicleConfirm')} ${vehicle.name}`}
                          onClick={() => remove(vehicle)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editing?.id ? t('admin.editVehicle') : t('admin.addVehicle')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            {countersAreCustom && (
              <Alert severity="warning">{t('admin.customCounters')}</Alert>
            )}
            <TextField
              label={t('admin.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label={t('kennzeichen')}
              value={kennzeichen}
              onChange={(e) => setKennzeichen(e.target.value)}
              fullWidth
            />
            <TextField
              select
              label={t('admin.preset')}
              value={preset}
              onChange={(e) => setPreset(e.target.value as VehiclePresetId)}
              fullWidth
            >
              {PRESET_IDS.map((id) => (
                <MenuItem key={id} value={id}>
                  {t(`admin.presets.${id}`)}
                </MenuItem>
              ))}
            </TextField>
            <FormControl fullWidth>
              <InputLabel id="fahrtenbuch-vehicle-fuel-label">
                {t('admin.fuelTypes')}
              </InputLabel>
              <Select
                labelId="fahrtenbuch-vehicle-fuel-label"
                multiple
                value={fuelTypes}
                onChange={(e) =>
                  setFuelTypes(
                    (typeof e.target.value === 'string'
                      ? e.target.value.split(',')
                      : e.target.value) as FuelType[],
                  )
                }
                input={<OutlinedInput label={t('admin.fuelTypes')} />}
                renderValue={(selected) =>
                  (selected as FuelType[]).map((f) => t(`fuel.${f}`)).join(', ')
                }
              >
                {FUEL_TYPES.map((fuel) => (
                  <MenuItem key={fuel} value={fuel}>
                    <Checkbox checked={fuelTypes.includes(fuel)} />
                    <ListItemText primary={t(`fuel.${fuel}`)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
              }
              label={t('admin.active')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving || !name.trim()}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {importOpen && (
        <VehicleImportDialog groupId={groupId} onClose={() => setImportOpen(false)} />
      )}
    </>
  );
}
