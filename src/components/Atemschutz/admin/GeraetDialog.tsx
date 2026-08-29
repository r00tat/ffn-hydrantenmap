'use client';

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import {
  ATEMSCHUTZ_GERAET_TYPEN,
  FUELLSTATION_STANDORTE,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
  type FuellstationStandort,
} from '../../../common/atemschutz';
import useFahrtenbuchVehicles from '../../../hooks/useFahrtenbuchVehicles';
import type { GeraetInput } from '../atemschutzActions';

export interface GeraetDialogProps {
  open: boolean;
  /** Fehlt beim Anlegen. */
  geraet?: AtemschutzGeraet;
  /** Vorschläge für das Feuerwehr-Feld, aus `useAtemschutzGeraete`. */
  feuerwehren: string[];
  /** Für die Fahrzeugwahl einer mobilen Füllstation. */
  groupId?: string;
  onClose: () => void;
  onSave: (input: GeraetInput) => Promise<void>;
}

interface FormState {
  typ: AtemschutzGeraetTyp;
  bezeichnung: string;
  feuerwehr: string;
  nummer: string;
  inventarNr: string;
  zusatzInventarNr: string;
  seriennummer: string;
  externeId: string;
  /** Als kommaseparierter Text im Formular; beim Speichern gesplittet. */
  barcodes: string;
  nenndruck: string;
  volumenLiter: string;
  material: string;
  hersteller: string;
  baujahr: string;
  active: boolean;
  bemerkung: string;
  standort: FuellstationStandort;
  vehicleId?: string;
  vehicleName?: string;
}

function initialState(geraet?: AtemschutzGeraet): FormState {
  return {
    typ: geraet?.typ ?? 'flasche',
    bezeichnung: geraet?.bezeichnung ?? '',
    feuerwehr: geraet?.feuerwehr ?? '',
    nummer: geraet?.nummer ?? '',
    inventarNr: geraet?.inventarNr ?? '',
    zusatzInventarNr: geraet?.zusatzInventarNr ?? '',
    seriennummer: geraet?.seriennummer ?? '',
    externeId: geraet?.externeId ?? '',
    barcodes: (geraet?.barcodes ?? []).join(', '),
    nenndruck: geraet?.nenndruck ? String(geraet.nenndruck) : '',
    volumenLiter: geraet?.volumenLiter ? String(geraet.volumenLiter) : '',
    material: geraet?.material ?? '',
    hersteller: geraet?.hersteller ?? '',
    baujahr: geraet?.baujahr ? String(geraet.baujahr) : '',
    active: geraet?.active !== false,
    bemerkung: geraet?.bemerkung ?? '',
    standort: geraet?.standort ?? 'fix',
    vehicleId: geraet?.vehicleId,
    vehicleName: geraet?.vehicleName,
  };
}

/** Leere Zahlenfelder ergeben `undefined`, nicht `0`. */
function toNumber(value: string): number | undefined {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Die Felder, die als halbbreites Textfeld nach demselben Muster laufen. */
const TEXT_FELDER = [
  'inventarNr',
  'zusatzInventarNr',
  'seriennummer',
  'externeId',
  'nenndruck',
  'volumenLiter',
  'material',
  'hersteller',
  'baujahr',
] as const;

export default function GeraetDialog({
  open,
  geraet,
  feuerwehren,
  groupId,
  onClose,
  onSave,
}: GeraetDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const { activeVehicles } = useFahrtenbuchVehicles(groupId);
  // `key={geraet?.id ?? 'new'}` am Aufrufer sorgt dafür, dass der Zustand beim
  // Wechsel des bearbeiteten Geräts neu aufgebaut wird — kein Effekt nötig.
  const [form, setForm] = useState<FormState>(() => initialState(geraet));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const istFuellstation = form.typ === 'fuellstation';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        typ: form.typ,
        bezeichnung: form.bezeichnung,
        feuerwehr: form.feuerwehr,
        nummer: form.nummer,
        inventarNr: form.inventarNr,
        zusatzInventarNr: form.zusatzInventarNr,
        seriennummer: form.seriennummer,
        externeId: form.externeId,
        barcodes: form.barcodes
          .split(/[,;\n]/)
          .map((b) => b.trim())
          .filter(Boolean),
        nenndruck: toNumber(form.nenndruck),
        volumenLiter: toNumber(form.volumenLiter),
        material: form.material,
        hersteller: form.hersteller,
        baujahr: toNumber(form.baujahr),
        active: form.active,
        bemerkung: form.bemerkung,
        // Nur an einer Füllstation haben die drei Felder eine Bedeutung. Wer
        // den Typ nachträglich wegdreht, soll keinen Fahrzeugbezug behalten.
        ...(istFuellstation
          ? {
              standort: form.standort,
              vehicleId: form.standort === 'mobil' ? form.vehicleId : undefined,
              vehicleName:
                form.standort === 'mobil' ? form.vehicleName : undefined,
            }
          : {}),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {geraet ? t('geraet.dialogTitleEdit') : t('geraet.dialogTitleNew')}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              fullWidth
              label={t('geraet.typ')}
              value={form.typ}
              onChange={(e) => set('typ', e.target.value as AtemschutzGeraetTyp)}
            >
              {ATEMSCHUTZ_GERAET_TYPEN.map((typ) => (
                <MenuItem key={typ} value={typ}>
                  {t(`typ.${typ}`)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label={t('geraet.nummer')}
              value={form.nummer}
              onChange={(e) => set('nummer', e.target.value)}
            />
          </Grid>
          {istFuellstation && (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  fullWidth
                  label={t('geraet.standort')}
                  value={form.standort}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      standort: e.target.value as FuellstationStandort,
                      // Eine fixe Station steht im Feuerwehrhaus und hat kein
                      // Fahrzeug. Den Bezug stehen zu lassen wäre ein
                      // Widerspruch im Datensatz.
                      ...(e.target.value === 'fix'
                        ? { vehicleId: undefined, vehicleName: undefined }
                        : {}),
                    }))
                  }
                >
                  {FUELLSTATION_STANDORTE.map((s) => (
                    <MenuItem key={s} value={s}>
                      {t(`geraet.standortWerte.${s}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {form.standort === 'mobil' && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    fullWidth
                    label={t('geraet.fahrzeug')}
                    value={form.vehicleId ?? ''}
                    onChange={(e) => {
                      const fzg = activeVehicles.find(
                        (v) => v.id === e.target.value,
                      );
                      setForm((prev) => ({
                        ...prev,
                        vehicleId: fzg?.id,
                        vehicleName: fzg?.name,
                      }));
                    }}
                  >
                    {activeVehicles.map((v) => (
                      <MenuItem key={v.id} value={v.id}>
                        {v.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}
            </>
          )}
          <Grid size={12}>
            <TextField
              fullWidth
              required
              label={t('geraet.bezeichnung')}
              value={form.bezeichnung}
              onChange={(e) => set('bezeichnung', e.target.value)}
            />
          </Grid>
          <Grid size={12}>
            {/* `freeSolo`: Die Vorschläge sind die bereits erfassten Wehren.
                Ein reines Auswahlfeld ließe die erste Flasche einer neuen Wehr
                gar nicht anlegen. */}
            <Autocomplete
              freeSolo
              options={feuerwehren}
              value={form.feuerwehr}
              onChange={(_, value) => set('feuerwehr', value ?? '')}
              onInputChange={(_, value) => set('feuerwehr', value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  required
                  label={t('geraet.feuerwehr')}
                />
              )}
            />
          </Grid>
          {TEXT_FELDER.map((key) => (
            <Grid size={{ xs: 12, sm: 6 }} key={key}>
              <TextField
                fullWidth
                label={t(`geraet.${key}`)}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Grid>
          ))}
          <Grid size={12}>
            <TextField
              fullWidth
              label={t('geraet.barcodes')}
              helperText={t('geraet.barcodesHint')}
              value={form.barcodes}
              onChange={(e) => set('barcodes', e.target.value)}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={t('geraet.bemerkung')}
              value={form.bemerkung}
              onChange={(e) => set('bemerkung', e.target.value)}
            />
          </Grid>
          <Grid size={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.active}
                  onChange={(e) => set('active', e.target.checked)}
                />
              }
              label={t('geraet.active')}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={saving || !form.bezeichnung.trim() || !form.feuerwehr.trim()}
          onClick={handleSave}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
