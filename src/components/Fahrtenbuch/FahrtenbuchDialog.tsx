'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  arrivalOnDepartureDay,
  FAHRT_ZWECKE,
  referenceCounters,
  validateEntryInput,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
  type FahrtZweck,
  type FuelType,
} from '../../common/fahrtenbuch';
import CounterFields from './CounterFields';
import {
  createFahrtenbuchEntry,
  updateFahrtenbuchEntry,
} from './fahrtenbuchActions';

export interface FahrtenbuchFirecallOption {
  id: string;
  name: string;
  /** Alarmierungszeitpunkt — auf Einsatzebene ist das `firecall.date`. */
  date?: string;
  abruecken?: string;
}

export interface FahrtenbuchDialogProps {
  open: boolean;
  groupId: string;
  vehicles: FahrtenbuchVehicle[];
  persons: FahrtenbuchPerson[];
  /** Einsätze der Gruppe, neueste zuerst — für die Auswahl beim Zweck `einsatz`. */
  firecalls: FahrtenbuchFirecallOption[];
  /** Bereits geladene Einträge — Grundlage für die Warnung beim Bearbeiten. */
  entries?: FahrtenbuchEntry[];
  /** Vorbelegtes Fahrzeug — gesetzt beim Direkt-Button auf der Fahrzeugkarte. */
  vehicleId?: string;
  /** Gesetzt beim Bearbeiten. */
  entry?: FahrtenbuchEntry;
  onClose: () => void;
}

/** Wandelt einen ISO-Zeitstempel in den Wert für `datetime-local` um. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Fehlerschlüssel, die die Server Actions unverändert zurückgeben. */
const TRANSLATED_SAVE_ERRORS = [
  'notAllowed',
  'notInGroup',
  'entryDeleted',
  'tooManyEntries',
] as const;

function fromLocalInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Startwerte aus dem Zähler-Cache des Fahrzeugs. Nur `startEnd`-Zähler haben
 * einen Startwert; ein `reading`-Zähler wird bei der Rückkehr abgelesen.
 */
function prefillCounters(
  definitions: CounterDefinition[],
  lastCounters: Record<string, number> = {},
): Record<string, CounterReading> {
  const prefilled: Record<string, CounterReading> = {};
  for (const def of definitions) {
    if (def.mode !== 'startEnd') continue;
    const start = lastCounters[def.id];
    if (start !== undefined) prefilled[def.id] = { start };
  }
  return prefilled;
}

export default function FahrtenbuchDialog({
  open,
  groupId,
  vehicles,
  persons,
  firecalls,
  entries = [],
  vehicleId,
  entry,
  onClose,
}: FahrtenbuchDialogProps) {
  const t = useTranslations('fahrtenbuch');
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    entry?.vehicleId ?? vehicleId ?? '',
  );
  const [driverName, setDriverName] = useState(entry?.driverName ?? '');
  const [driverId, setDriverId] = useState<string | undefined>(entry?.driverId);
  const [zweck, setZweck] = useState<FahrtZweck>(entry?.zweck ?? 'sonstiges');
  const [firecallId, setFirecallId] = useState<string | undefined>(
    entry?.firecallId,
  );
  const [ziel, setZiel] = useState(entry?.ziel ?? '');
  const [abfahrt, setAbfahrt] = useState(
    entry?.abfahrt ?? new Date().toISOString(),
  );
  const [ankunft, setAnkunft] = useState(
    entry?.ankunft ?? arrivalOnDepartureDay(new Date().toISOString()),
  );
  const [betriebsmittel, setBetriebsmittel] = useState<
    Partial<Record<FuelType, number>>
  >(entry?.betriebsmittel ?? {});
  const [hinweise, setHinweise] = useState(entry?.hinweise ?? '');
  const [defekt, setDefekt] = useState(entry?.defekt ?? false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId),
    [vehicles, selectedVehicleId],
  );
  const definitions = useMemo(() => vehicle?.counters ?? [], [vehicle]);

  // Kein useEffect zum Vorbelegen: die Zählerstände werden beim Rendern
  // abgeleitet. Der Zustand merkt sich, zu welchem Fahrzeug die Eingaben
  // gehören — nach einem Fahrzeugwechsel greift wieder die Vorbelegung aus
  // dem Zähler-Cache des neuen Fahrzeugs.
  const [countersState, setCountersState] = useState<{
    vehicleId: string;
    values: Record<string, CounterReading>;
  }>(() =>
    entry
      ? { vehicleId: entry.vehicleId, values: entry.counters ?? {} }
      : { vehicleId: '', values: {} },
  );

  const counters =
    countersState.vehicleId === selectedVehicleId
      ? countersState.values
      : prefillCounters(definitions, vehicle?.lastCounters);

  const setCounters = (values: Record<string, CounterReading>) =>
    setCountersState({ vehicleId: selectedVehicleId, values });

  const lastCounters = referenceCounters(
    entries,
    selectedVehicleId,
    vehicle?.lastCounters ?? {},
    entry?.id,
  );

  const counterLabel = (id: string) => {
    const def = definitions.find((d) => d.id === id);
    if (!def) return id;
    return def.labelKey ? t(def.labelKey as 'counters.km') : def.label;
  };

  const errorMessage = (error: string) => {
    const [key, counterId] = error.split(':');
    if (counterId) {
      return t(`errors.${key}` as 'errors.counterMissing', {
        counter: counterLabel(counterId),
      });
    }
    return t(`errors.${key}` as 'errors.vehicleMissing');
  };

  const save = async () => {
    const firecall = firecalls.find((f) => f.id === firecallId);
    // Kein vehicleName: der Server leitet ihn aus dem geladenen Fahrzeug ab,
    // damit Name und Zähler nicht auseinanderlaufen können.
    const input = {
      vehicleId: selectedVehicleId,
      driverId,
      driverName,
      zweck,
      firecallId: zweck === 'einsatz' ? firecallId : undefined,
      firecallName: zweck === 'einsatz' ? firecall?.name : undefined,
      ziel,
      abfahrt,
      ankunft,
      counters,
      betriebsmittel,
      hinweise,
      defekt,
    };

    const validationErrors = validateEntryInput(definitions, input);
    setErrors(validationErrors);
    setSaveError(undefined);
    if (validationErrors.length > 0) return;

    setSaving(true);
    const result = entry?.id
      ? await updateFahrtenbuchEntry(groupId, entry.id, input)
      : await createFahrtenbuchEntry(groupId, input);
    setSaving(false);
    if (result.success) {
      onClose();
    } else {
      const known = TRANSLATED_SAVE_ERRORS.find((key) => key === result.error);
      setSaveError(
        known
          ? t(`errors.${known}` as 'errors.notInGroup')
          : t('errors.saveFailed', { message: result.error ?? '' }),
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{entry ? t('editEntry') : t('newEntry')}</DialogTitle>
      <DialogContent>
        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {saveError}
          </Alert>
        )}
        {errors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errors.map((error) => (
              <div key={error}>{errorMessage(error)}</div>
            ))}
          </Alert>
        )}
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              select
              fullWidth
              label={t('vehicle')}
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Autocomplete
              freeSolo
              options={persons.map((p) => p.name)}
              value={driverName}
              onInputChange={(_, value) => {
                setDriverName(value);
                setDriverId(persons.find((p) => p.name === value)?.id);
              }}
              renderInput={(params) => (
                <TextField {...params} label={t('driver')} />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              fullWidth
              label={t('zweck')}
              value={zweck}
              onChange={(e) => setZweck(e.target.value as FahrtZweck)}
            >
              {FAHRT_ZWECKE.map((z) => (
                <MenuItem key={z} value={z}>
                  {t(`zwecke.${z}` as 'zwecke.einsatz')}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label={t('ziel')}
              value={ziel}
              onChange={(e) => setZiel(e.target.value)}
            />
          </Grid>
          {zweck === 'einsatz' && (
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                fullWidth
                label={t('firecall')}
                value={firecallId ?? ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setFirecallId(id || undefined);
                  const firecall = firecalls.find((f) => f.id === id);
                  // Einsatzdaten als Zeitvorschlag übernehmen
                  if (firecall?.date) setAbfahrt(firecall.date);
                  if (firecall?.abruecken) setAnkunft(firecall.abruecken);
                }}
              >
                {firecalls.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label={t('abfahrt')}
              value={toLocalInput(abfahrt)}
              onChange={(e) => {
                const next = fromLocalInput(e.target.value);
                setAbfahrt(next);
                // Die Ankunft zieht mit dem Datum mit und behält ihre Uhrzeit —
                // eine Fahrt endet im Normalfall am Tag der Abfahrt. Ein Ende
                // nach Mitternacht bleibt über das Ankunftsfeld eintragbar.
                if (next)
                  setAnkunft((current) =>
                    arrivalOnDepartureDay(next, new Date(current)),
                  );
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label={t('ankunft')}
              value={toLocalInput(ankunft)}
              onChange={(e) => setAnkunft(fromLocalInput(e.target.value))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <CounterFields
              definitions={definitions}
              counters={counters}
              lastCounters={lastCounters}
              onChange={setCounters}
            />
          </Grid>
          {(vehicle?.fuelTypes ?? []).map((fuel) => (
            <Grid size={{ xs: 12, sm: 4 }} key={fuel}>
              <TextField
                fullWidth
                type="number"
                label={t(`fuel.${fuel}` as 'fuel.diesel')}
                value={betriebsmittel[fuel] ?? ''}
                onChange={(e) =>
                  setBetriebsmittel({
                    ...betriebsmittel,
                    [fuel]:
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </Grid>
          ))}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={t('hinweise')}
              value={hinweise}
              onChange={(e) => setHinweise(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={defekt}
                  onChange={(e) => setDefekt(e.target.checked)}
                />
              }
              label={t('defekt')}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
