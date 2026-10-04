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
import { useState } from 'react';
import type {
  Geraet,
  GeraetEinheitVerwendungsnachweis,
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

/**
 * Artikel anlegen oder bearbeiten.
 *
 * Im Mittelpunkt stehen die Felder, die nur hier gepflegt werden und die der
 * Import nie anfasst: Verbrauchsmaterial, Einheit, Mindestbestand,
 * Kostenersatz-Position. Die Stammdaten aus Sybos (Bezeichnung, Inventar-Nr.,
 * Klasse) sind editierbar, damit sich auch ein Artikel ohne Sybos anlegen
 * lässt — bei importierten Artikeln überschreibt sie der nächste Import.
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

  const [bezeichnung, setBezeichnung] = useState(geraet?.bezeichnung ?? '');
  const [inventarNr, setInventarNr] = useState(geraet?.inventarNr ?? '');
  const [klasse1, setKlasse1] = useState(geraet?.klasse1 ?? '');
  const [bemerkung, setBemerkung] = useState(geraet?.bemerkung ?? '');
  const [verbrauchsmaterial, setVerbrauchsmaterial] = useState(
    geraet?.verbrauchsmaterial ?? false,
  );
  const [einheit, setEinheit] = useState(geraet?.einheit ?? '');
  const [mindestbestand, setMindestbestand] = useState(
    geraet?.mindestbestand != null ? String(geraet.mindestbestand) : '',
  );
  const [kostenersatzRateId, setKostenersatzRateId] = useState(
    geraet?.kostenersatzRateId ?? '',
  );
  const [nachweis, setNachweis] = useState<Nachweis>(
    geraet?.einheitVerwendungsnachweis ?? '',
  );
  const [active, setActive] = useState(geraet?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const isImported = !!geraet?.externeId;

  const handleSave = async () => {
    setError(undefined);
    if (!bezeichnung.trim()) {
      setError(t('errors.bezeichnungRequired'));
      return;
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
    // Feld am Artikel, `null` den Mindestbestand. Deshalb gehen alle Felder
    // des Formulars mit, auch die leeren.
    const input: SaveGeraetInput = {
      ...(geraet ? { id: geraet.id } : {}),
      bezeichnung: bezeichnung.trim(),
      inventarNr: inventarNr.trim(),
      klasse1: klasse1.trim(),
      bemerkung: bemerkung.trim(),
      verbrauchsmaterial,
      einheit: einheit.trim(),
      // Der Mindestbestand gilt nur für Verbrauchsmaterial — ein Gerät wird
      // nicht nachbestellt. `null` löscht ihn samt Nachbestellmarke.
      mindestbestand: verbrauchsmaterial && min !== undefined ? min : null,
      kostenersatzRateId: kostenersatzRateId.trim(),
      einheitVerwendungsnachweis: nachweis,
      active,
    };
    const outcome = await callAction(() =>
      saveGeraet(groupId, input),
    );
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {geraet ? t('edit.titleEdit') : t('edit.titleNew')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {isImported && (
            <Typography variant="body2" color="text.secondary">
              {t('edit.importHint')}
            </Typography>
          )}
          <TextField
            label={t('fields.bezeichnung')}
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
            required
            fullWidth
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('fields.inventarNr')}
              value={inventarNr}
              onChange={(e) => setInventarNr(e.target.value)}
              fullWidth
            />
            <TextField
              label={t('fields.klasse1')}
              value={klasse1}
              onChange={(e) => setKlasse1(e.target.value)}
              fullWidth
            />
          </Stack>

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

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('fields.einheit')}
              helperText={t('fields.einheitHint')}
              value={einheit}
              onChange={(e) => setEinheit(e.target.value)}
              fullWidth
            />
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
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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
            <TextField
              label={t('fields.kostenersatzRateId')}
              helperText={t('fields.kostenersatzRateIdHint')}
              value={kostenersatzRateId}
              onChange={(e) => setKostenersatzRateId(e.target.value)}
              fullWidth
            />
          </Stack>

          <TextField
            label={t('fields.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          <FormControlLabel
            control={
              <Switch
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
            }
            label={t('fields.active')}
          />
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
