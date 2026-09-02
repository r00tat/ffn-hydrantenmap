'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  truppLabel,
  validateDruckabfrage,
  type AtemschutzTrupp,
  type DruckabfrageInput,
} from '../../common/atemschutz';
import { fromLocalInput, toLocalInput } from '../../common/zeitEingabe';

export interface DruckabfrageDialogProps {
  open: boolean;
  trupp: AtemschutzTrupp;
  /**
   * Ob die Ankunftsmeldung noch fehlt.
   *
   * Zeigt einen **Hinweis**, setzt aber ausdrücklich **nicht** den Haken:
   * Vorbelegt hätte jede gewöhnliche Zwischenabfrage als Ankunft gegolten, und
   * daraus rechnet sich der Rückmarschdruck. Ein zu früh gesetzter Haken macht
   * ihn zu einer Behauptung — die falsche Richtung bei einer
   * Sicherheitsfunktion. Der Hinweis erinnert stattdessen daran, dass der Wert
   * noch fehlt.
   */
  zielMeldungFehlt: boolean;
  onClose: () => void;
  onSave: (input: DruckabfrageInput) => Promise<void>;
}

/**
 * Eine Druckabfrage erfassen.
 *
 * Ein Feld für einen Druck und nicht drei: Maßgeblich ist der geringste Druck
 * im Trupp (FH-06 5.3.2). Drei Werte abzufragen kostet Funkzeit, und gerechnet
 * würde ohnehin nur mit dem kleinsten.
 */
export default function DruckabfrageDialog({
  open,
  trupp,
  zielMeldungFehlt,
  onClose,
  onSave,
}: DruckabfrageDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [druck, setDruck] = useState('');
  const [amZiel, setAmZiel] = useState(false);
  const [bemerkung, setBemerkung] = useState('');
  // Vorbelegt mit jetzt, aber änderbar: Die Meldung kommt über Funk und wird
  // eine Minute später eingetippt — mit dem Erfassungszeitpunkt gerechnet,
  // sähe der Verbrauch zu niedrig aus.
  const [zeit, setZeit] = useState(() => toLocalInput(new Date()));
  const [saving, setSaving] = useState(false);

  const druckWert = druck.trim()
    ? Number(druck.trim().replace(',', '.'))
    : undefined;
  const input: DruckabfrageInput = {
    druck: druckWert,
    amZiel,
    bemerkung,
    zeitpunkt: fromLocalInput(zeit),
  };
  const fehler = validateDruckabfrage(input);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(input);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('ueberwachung.druckabfrageTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {truppLabel(trupp)}
          </Typography>
          <TextField
            fullWidth
            required
            autoFocus
            type="number"
            label={t('ueberwachung.druck')}
            helperText={t('ueberwachung.druckHint')}
            value={druck}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            onChange={(e) => setDruck(e.target.value)}
          />
          <TextField
            fullWidth
            type="datetime-local"
            label={t('ueberwachung.zeitpunkt')}
            value={zeit}
            onChange={(e) => setZeit(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={amZiel}
                onChange={(e) => setAmZiel(e.target.checked)}
              />
            }
            label={t('ueberwachung.amZiel')}
          />
          <Typography variant="caption" color="text.secondary">
            {t('ueberwachung.amZielHint')}
          </Typography>
          {zielMeldungFehlt && !amZiel && (
            <Alert severity="info">{t('ueberwachung.amZielFehltHinweis')}</Alert>
          )}
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t('ueberwachung.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
          />
          {fehler.length > 0 && druck.trim() !== '' && (
            <Alert severity="warning">
              {fehler
                .map((key) =>
                  t(
                    `ueberwachung.errors.${key}` as 'ueberwachung.errors.druckMissing',
                  ),
                )
                .join(' · ')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={saving || fehler.length > 0}
          onClick={handleSave}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
