'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FAHRT_ZWECKE,
  type FahrtenbuchPerson,
  type FahrtZweck,
} from '../../../common/fahrtenbuch';
import type { ImportPlanRow, ImportRowEdit } from '../fahrtenbuchImportPlan';
import { fromLocalInput, toLocalInput } from '../useEntryFormState';

/** Zahl aus einem Zahlenfeld — Leereingabe heißt „kein Wert", nicht `0`. */
function toNumber(value: string): number | undefined {
  const text = value.trim();
  if (text === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface ImportRowEditDialogProps {
  row: ImportPlanRow;
  /** Alle Personen der Gruppe, auch deaktivierte — ein Fahrtenbuch reicht
   *  zurück, und ein ausgetretener Fahrer ist der Normalfall. */
  persons: FahrtenbuchPerson[];
  onSave: (edit: ImportRowEdit) => void;
  onClose: () => void;
  /** Setzt die Zeile auf den gelesenen Stand zurück; fehlt, wenn unbearbeitet. */
  onDiscard?: () => void;
}

/**
 * Korrektur einer einzelnen Importzeile — vor allem des Fahrers, den ein
 * Export gern abgekürzt oder falsch geschrieben nennt.
 *
 * Der Dialog schreibt nichts in die Quelle: Er gibt die geänderten Werte an
 * den Plan zurück, der daraus den Entwurf neu baut. Damit bleibt die gelesene
 * Zeile unangetastet und jede Korrektur ist rücknehmbar — in einem
 * Nachweisdokument muss nachvollziehbar bleiben, was aus dem PDF stammt und
 * was ein Mensch eingetragen hat.
 */
export default function ImportRowEditDialog({
  row,
  persons,
  onSave,
  onClose,
  onDiscard,
}: ImportRowEditDialogProps) {
  const t = useTranslations('fahrtenbuch');
  const [driverName, setDriverName] = useState(row.values.driverName);
  const [zweck, setZweck] = useState<FahrtZweck>(row.values.zweck);
  const [ziel, setZiel] = useState(row.values.ziel);
  const [abfahrt, setAbfahrt] = useState(toLocalInput(row.values.abfahrt));
  const [ankunft, setAnkunft] = useState(toLocalInput(row.values.ankunft));
  const [startKm, setStartKm] = useState(row.values.startKm?.toString() ?? '');
  const [endeKm, setEndeKm] = useState(row.values.endeKm?.toString() ?? '');
  const [hinweise, setHinweise] = useState(row.values.hinweise);

  // Alle Felder wandern in die Korrektur, auch die unveränderten: Der Plan
  // vergleicht sie ohnehin mit der gelesenen Zeile und meldet nur eine
  // tatsächliche Abweichung als Bearbeitung.
  const save = () =>
    onSave({
      driverName,
      zweck,
      ziel,
      abfahrt: fromLocalInput(abfahrt),
      ankunft: fromLocalInput(ankunft),
      startKm: toNumber(startKm),
      endeKm: toNumber(endeKm),
      hinweise,
    });

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t('admin.pdfImport.editRow', { line: row.line })}</DialogTitle>
      <DialogContent>
        <DialogContentText variant="body2" sx={{ mb: 2 }}>
          {t('admin.pdfImport.editHint')}
        </DialogContentText>
        {/* Der Rohtext der Zeile bleibt sichtbar: Wer eine unlesbare Zeile von
            Hand ergänzt, braucht die Quelle daneben. */}
        {row.raw && (
          <DialogContentText
            variant="caption"
            sx={{ mb: 2, display: 'block', wordBreak: 'break-word' }}
          >
            {row.raw}
          </DialogContentText>
        )}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Autocomplete
              freeSolo
              options={persons.map((p) => p.name)}
              value={driverName}
              onInputChange={(_, value) => setDriverName(value)}
              renderInput={(params) => (
                <TextField {...params} label={t('driver')} autoFocus />
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
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label={t('abfahrt')}
              value={abfahrt}
              onChange={(e) => setAbfahrt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label={t('ankunft')}
              value={ankunft}
              onChange={(e) => setAnkunft(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label={t('admin.pdfImport.kmStart')}
              value={startKm}
              onChange={(e) => setStartKm(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label={t('admin.pdfImport.kmEnd')}
              value={endeKm}
              onChange={(e) => setEndeKm(e.target.value)}
            />
          </Grid>
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
        </Grid>
      </DialogContent>
      <DialogActions>
        {onDiscard && (
          <Button color="warning" onClick={onDiscard} sx={{ mr: 'auto' }}>
            {t('admin.pdfImport.discardEdit')}
          </Button>
        )}
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" onClick={save}>
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
