'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  GERAET_MATERIAL_TYPEN,
  type Geraet,
  type GeraetEinheitVerwendungsnachweis,
  type GeraetMaterialTyp,
} from '../../../common/geraet';
import {
  deleteGeraet,
  saveGeraet,
  type SaveGeraetInput,
} from '../geraeteActions';
import { callAction } from './actionResult';

export interface GeraetEditDialogProps {
  open: boolean;
  groupId: string;
  /** Ohne Artikel: neu anlegen. */
  geraet?: Geraet;
  onClose: () => void;
  /** Nach dem Speichern oder Löschen; die Liste aktualisiert sich live. */
  onDone?: (result: 'saved' | 'deleted') => void;
}

type Nachweis = GeraetEinheitVerwendungsnachweis | '';

/** Textfelder der Stammdaten — ein leerer Wert löscht das Feld am Artikel. */
const TEXT_FIELDS = [
  'bezeichnung',
  'inventarNr',
  'zusatzInventarNr',
  'kategorie',
  'klasse1',
  'klasse2',
  'klasse3',
  'vorlage',
  'hersteller',
  'herstellerTyp',
  'seriennummer',
  'besitzer',
  'anschaffungsDatum',
  'verfuegbarVon',
  'verfuegbarBis',
  'lebensdauerEinheit',
  'bemerkung',
  'zubehoer',
  'versicherung',
  'polizzenummer',
  'kasko',
  'einheit',
  'kostenersatzRateId',
] as const satisfies readonly (keyof Geraet)[];

type TextFieldName = (typeof TEXT_FIELDS)[number];

/** Zahlenfelder mit ihrer Prüfung; leer heißt löschen. */
const NUMBER_FIELDS = {
  baujahr: (n: number) => Number.isInteger(n) && n > 1900,
  baumonat: (n: number) => Number.isInteger(n) && n >= 1 && n <= 12,
  lebensdauer: (n: number) => n > 0,
  einkaufspreis: (n: number) => n >= 0,
} as const satisfies Partial<Record<keyof Geraet, (n: number) => boolean>>;

type NumberField = keyof typeof NUMBER_FIELDS;
type FormField = TextFieldName | NumberField | 'barcodes';
type FormState = Record<FormField, string>;

function initialForm(geraet?: Geraet): FormState {
  const form = {} as FormState;
  for (const field of TEXT_FIELDS) form[field] = geraet?.[field] ?? '';
  for (const field of Object.keys(NUMBER_FIELDS) as NumberField[]) {
    const value = geraet?.[field];
    form[field] = value != null ? String(value).replace('.', ',') : '';
  }
  form.barcodes = (geraet?.barcodes ?? []).join(', ');
  return form;
}

/** „70,5" oder „70.5"; `null` bei leerem Feld, `NaN` bei Unlesbarem. */
function parseNumber(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (!value) return null;
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * Artikel anlegen oder bearbeiten — mit allen Stammdaten, die der Import aus
 * Sybos übernimmt, und den Feldern, die nur hier gepflegt werden
 * (Verbrauchsmaterial, Einheit, Mindestbestand, Kostenersatz-Position).
 * Bei importierten Artikeln überschreibt der nächste Import die Sybos-Felder,
 * die App-Felder fasst er nie an.
 */
export default function GeraetEditDialog({
  open,
  groupId,
  geraet,
  onClose,
  onDone,
}: GeraetEditDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');

  const [form, setForm] = useState<FormState>(() => initialForm(geraet));
  const [materialTyp, setMaterialTyp] = useState<GeraetMaterialTyp | ''>(
    geraet?.materialTyp ?? '',
  );
  const [verbrauchsmaterial, setVerbrauchsmaterial] = useState(
    geraet?.verbrauchsmaterial ?? false,
  );
  const [mindestbestand, setMindestbestand] = useState(
    geraet?.mindestbestand != null ? String(geraet.mindestbestand) : '',
  );
  const [nachweis, setNachweis] = useState<Nachweis>(
    geraet?.einheitVerwendungsnachweis ?? '',
  );
  const [active, setActive] = useState(geraet?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const isImported = !!geraet?.externeId;

  const field = (
    name: FormField,
    options: {
      label?: string;
      helperText?: string;
      required?: boolean;
      multiline?: boolean;
      type?: 'date';
      inputMode?: 'decimal' | 'numeric';
    } = {},
  ) => (
    <TextField
      label={options.label ?? t(`fields.${name}`)}
      helperText={options.helperText}
      value={form[name]}
      onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
      required={options.required}
      multiline={options.multiline}
      minRows={options.multiline ? 2 : undefined}
      type={options.type}
      slotProps={{
        ...(options.type === 'date' ? { inputLabel: { shrink: true } } : {}),
        ...(options.inputMode ? { htmlInput: { inputMode: options.inputMode } } : {}),
      }}
      fullWidth
    />
  );

  const handleSave = async () => {
    setError(undefined);
    if (!form.bezeichnung.trim()) {
      setError(t('errors.bezeichnungRequired'));
      return;
    }
    const numbers = {} as Record<NumberField, number | null>;
    for (const [name, isValid] of Object.entries(NUMBER_FIELDS) as [
      NumberField,
      (n: number) => boolean,
    ][]) {
      const value = parseNumber(form[name]);
      if (value !== null && (Number.isNaN(value) || !isValid(value))) {
        setError(t('errors.fieldInvalid', { field: t(`fields.${name}`) }));
        return;
      }
      numbers[name] = value;
    }
    let min: number | undefined;
    if (verbrauchsmaterial && mindestbestand.trim()) {
      min = Number(mindestbestand.replace(',', '.'));
      if (!Number.isInteger(min) || min < 0) {
        setError(t('errors.mindestbestandInvalid'));
        return;
      }
    }

    setBusy(true);
    // `saveGeraet` ändert nur übergebene Felder: ein leerer Text löscht das
    // Feld am Artikel, `null` eine Zahl. Deshalb gehen alle Felder des
    // Formulars mit, auch die leeren.
    const input: SaveGeraetInput = {
      ...(geraet ? { id: geraet.id } : {}),
      ...Object.fromEntries(TEXT_FIELDS.map((name) => [name, form[name].trim()])),
      ...numbers,
      barcodes: form.barcodes
        .split(/[,;\n]/)
        .map((b) => b.trim())
        .filter(Boolean),
      materialTyp,
      verbrauchsmaterial,
      // Der Mindestbestand gilt nur für Verbrauchsmaterial — ein Gerät wird
      // nicht nachbestellt. `null` löscht ihn samt Nachbestellmarke.
      mindestbestand: verbrauchsmaterial && min !== undefined ? min : null,
      einheitVerwendungsnachweis: nachweis,
      active,
    };
    const outcome = await callAction(() => saveGeraet(groupId, input));
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onDone?.('saved');
    onClose();
  };

  const handleDelete = async () => {
    if (!geraet) return;
    if (!window.confirm(t('edit.deleteConfirm'))) return;
    setError(undefined);
    setBusy(true);
    const outcome = await callAction(() => deleteGeraet(groupId, geraet.id));
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onDone?.('deleted');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {geraet ? t('edit.titleEdit') : t('edit.titleNew')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Section title={t('edit.sectionApp')}>
            <FormControlLabel
              control={
                <Switch
                  checked={verbrauchsmaterial}
                  onChange={(e) => setVerbrauchsmaterial(e.target.checked)}
                />
              }
              label={t('fields.verbrauchsmaterial')}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              {t('fields.verbrauchsmaterialHint')}
            </Typography>
            <Row>
              {field('einheit', { helperText: t('fields.einheitHint') })}
              <TextField
                label={t('fields.mindestbestand')}
                helperText={t('fields.mindestbestandHint')}
                value={mindestbestand}
                onChange={(e) => setMindestbestand(e.target.value)}
                disabled={!verbrauchsmaterial}
                type="number"
                slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }}
                fullWidth
              />
            </Row>
            <Row>
              <TextField
                select
                label={t('fields.einheitVerwendungsnachweis')}
                value={nachweis}
                onChange={(e) => setNachweis(e.target.value as Nachweis)}
                fullWidth
              >
                <MenuItem value="">{t('verwendungsnachweis.none')}</MenuItem>
                <MenuItem value="stk">{t('verwendungsnachweis.stk')}</MenuItem>
                <MenuItem value="h">{t('verwendungsnachweis.h')}</MenuItem>
              </TextField>
              {field('kostenersatzRateId', { helperText: t('fields.kostenersatzRateIdHint') })}
            </Row>
            <FormControlLabel
              control={
                <Switch checked={active} onChange={(e) => setActive(e.target.checked)} />
              }
              label={t('fields.active')}
            />
          </Section>

          <Section title={t('edit.sectionSybos')}>
            {isImported && (
              <Typography variant="body2" color="text.secondary">
                {t('edit.importHint')}
              </Typography>
            )}
            {field('bezeichnung', { required: true })}
            <Row>
              {field('inventarNr')}
              {field('zusatzInventarNr')}
            </Row>
            {field('barcodes', { helperText: t('fields.barcodesHint') })}
            <Row>
              {field('kategorie')}
              {field('vorlage')}
            </Row>
            <Row>
              {field('klasse1')}
              {field('klasse2')}
              {field('klasse3')}
            </Row>
            <TextField
              select
              label={t('fields.materialTyp')}
              value={materialTyp}
              onChange={(e) => setMaterialTyp(e.target.value as GeraetMaterialTyp | '')}
              fullWidth
            >
              <MenuItem value="">{t('verwendungsnachweis.none')}</MenuItem>
              {GERAET_MATERIAL_TYPEN.map((typ) => (
                <MenuItem key={typ} value={typ}>
                  {typ}
                </MenuItem>
              ))}
            </TextField>
            <Row>
              {field('hersteller')}
              {field('herstellerTyp')}
              {field('seriennummer')}
            </Row>
            <Row>
              {field('baujahr', { inputMode: 'numeric' })}
              {field('baumonat', { inputMode: 'numeric' })}
              {field('besitzer')}
            </Row>
            <Row>
              {field('anschaffungsDatum', { type: 'date' })}
              {field('verfuegbarVon', { type: 'date' })}
              {field('verfuegbarBis', { type: 'date' })}
            </Row>
            <Row>
              {field('lebensdauer', { inputMode: 'decimal' })}
              {field('lebensdauerEinheit')}
              {field('einkaufspreis', { inputMode: 'decimal' })}
            </Row>
            {field('bemerkung', { multiline: true })}
            {field('zubehoer', { multiline: true })}
            <Row>
              {field('versicherung')}
              {field('polizzenummer')}
              {field('kasko')}
            </Row>
          </Section>
        </Stack>
      </DialogContent>
      <DialogActions>
        {geraet && (
          <Button color="error" onClick={handleDelete} disabled={busy} sx={{ mr: 'auto' }}>
            {tCommon('delete')}
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={busy}>
          {busy ? tCommon('saving') : tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      {children}
    </Stack>
  );
}
