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
import { vehicleKategorie } from '../../../common/fahrtenbuch';
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

/**
 * Die Felder, die als halbbreites Textfeld nach demselben Muster laufen.
 *
 * Die Inventarnummer steht **nicht** darin: Sie ist die führende Kennung und
 * hat deshalb ihren Platz in der ersten Zeile, neben dem Typ.
 */
const TEXT_FELDER = [
  'nummer',
  'zusatzInventarNr',
  'seriennummer',
  'externeId',
  'material',
  'hersteller',
  'baujahr',
] as const;

/**
 * Was nur die Flasche hat.
 *
 * An einer Maske oder einem Kompressor wäre beides eine Erfindung — der
 * Import lässt die Felder dort aus demselben Grund weg, und
 * `vorgabeGeraetesatz` liest sie ohnehin nur an Flaschen.
 */
const FLASCHEN_FELDER = ['nenndruck', 'volumenLiter'] as const;

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
  const tFahrtenbuch = useTranslations('fahrtenbuch');
  const { activeVehicles } = useFahrtenbuchVehicles(groupId);
  // `key={geraet?.id ?? 'new'}` am Aufrufer sorgt dafür, dass der Zustand beim
  // Wechsel des bearbeiteten Geräts neu aufgebaut wird — kein Effekt nötig.
  const [form, setForm] = useState<FormState>(() => initialState(geraet));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const istFuellstation = form.typ === 'fuellstation';
  const istFlasche = form.typ === 'flasche';

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
        // Wie beim Standort der Füllstation: Wer den Typ wegdreht, soll keine
        // Flaschenwerte behalten.
        nenndruck: istFlasche ? toNumber(form.nenndruck) : undefined,
        volumenLiter: istFlasche ? toNumber(form.volumenLiter) : undefined,
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
        {/* `mt` und nicht `0`: `DialogContent` direkt unter `DialogTitle` hat
            in MUI kein oberes Padding, und das nach oben versetzte Label eines
            Outlined-Feldes der ersten Zeile wird sonst vom Scroll-Container
            beschnitten. */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
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
              label={t('geraet.inventarNr')}
              value={form.inventarNr}
              onChange={(e) => set('inventarNr', e.target.value)}
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
                  {/* Freie Eingabe neben der Fahrzeugliste: Anhänger stehen
                      nicht im Fahrtenbuch — sie führen keines. Der
                      Atemschutzanhänger, auf dem der Kompressor verlastet ist,
                      wäre in einer reinen Auswahlliste nicht eintragbar. Wird
                      ein Fahrzeug der Gruppe gewählt, bleibt der Bezug über
                      `vehicleId` erhalten; bei freiem Text steht nur der
                      Name. */}
                  <Autocomplete
                    freeSolo
                    options={activeVehicles}
                    getOptionLabel={(option) =>
                      typeof option === 'string' ? option : option.name
                    }
                    // Die Liste steht ohnehin nach Kategorie sortiert; die
                    // Überschriften machen sichtbar, wo die Anhänger anfangen.
                    groupBy={(option) =>
                      typeof option === 'string'
                        ? ''
                        : tFahrtenbuch(
                            `vehicleKategorie.${vehicleKategorie(option)}`,
                          )
                    }
                    inputValue={form.vehicleName ?? ''}
                    onInputChange={(_, value) => {
                      const fzg = activeVehicles.find((v) => v.name === value);
                      setForm((prev) => ({
                        ...prev,
                        vehicleId: fzg?.id,
                        vehicleName: value || undefined,
                      }));
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label={t('geraet.fahrzeug')}
                      />
                    )}
                  />
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
          {[...TEXT_FELDER, ...(istFlasche ? FLASCHEN_FELDER : [])].map(
            (key) => (
              <Grid size={{ xs: 12, sm: 6 }} key={key}>
                <TextField
                  fullWidth
                  label={t(`geraet.${key}`)}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Grid>
            ),
          )}
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
