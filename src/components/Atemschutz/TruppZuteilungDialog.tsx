'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { zuteilungPatch, type TruppPatch } from '../../common/atemschutz';
import { fromLocalInput, toLocalInput } from '../../common/zeitEingabe';

export interface TruppZuteilungDialogProps {
  open: boolean;
  /** Vorbelegung aus der vorigen Bereitstellung desselben Trupps. */
  entsendetAnVorschlag?: string;
  /** Fahrzeuge und taktische Einheiten des Einsatzes. */
  entsendetAnVorschlaege: string[];
  onClose: () => void;
  onConfirm: (patch: TruppPatch) => Promise<void>;
}

/**
 * Der Sammelplatz übergibt einen Trupp an eine taktische Einheit.
 *
 * Drei Felder und **kein** Einsatzziel und kein Auftrag: Der Sammelplatz
 * entsendet einen Trupp nur zu einer Einheit, den Einsatzauftrag gibt die
 * Einheit. Ein Zielfeld hier führte zu einer Angabe, die niemand kennt.
 */
export default function TruppZuteilungDialog({
  open,
  entsendetAnVorschlag,
  entsendetAnVorschlaege,
  onClose,
  onConfirm,
}: TruppZuteilungDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [zeit, setZeit] = useState(() => toLocalInput(new Date()));
  /**
   * Ob die Zeit von Hand geändert wurde — entscheidet über die **Sekunden**.
   * `datetime-local` kennt nur Minuten; unverändert gilt der genaue Zeitpunkt
   * des Speicherns.
   */
  const [zeitGeaendert, setZeitGeaendert] = useState(false);
  const [druck, setDruck] = useState('');
  const [entsendetAn, setEntsendetAn] = useState(entsendetAnVorschlag ?? '');
  const [saving, setSaving] = useState(false);

  const druckWert = druck.trim()
    ? Number(druck.trim().replace(',', '.'))
    : undefined;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(
        zuteilungPatch({
          entsendetAn,
          uebergabeZeit:
            (zeitGeaendert ? fromLocalInput(zeit) : undefined) ??
            new Date().toISOString(),
          druckUebergabe: Number.isFinite(druckWert) ? druckWert : undefined,
        }),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('trupp.zuteilenTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Warum das kein Abmarsch ist, steht im Dialog: „Entsenden" klang
              vorher nach „geht jetzt unter Atemschutz", und daran hängt jede
              Rechnung der Zeitkontrolle. */}
          <Alert severity="info">{t('trupp.zuteilenHinweis')}</Alert>
          {/* Freitext mit Vorschlägen: Der Trupp geht meist zu einem Fahrzeug,
              manchmal zu einem Abschnitt, den es in keiner Liste gibt. */}
          <Autocomplete
            freeSolo
            fullWidth
            options={entsendetAnVorschlaege}
            value={entsendetAn}
            onInputChange={(_, next) => setEntsendetAn(next ?? '')}
            onChange={(_, next) =>
              setEntsendetAn(typeof next === 'string' ? next : '')
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('trupp.entsendetAn')}
                helperText={t('trupp.entsendetAnHint')}
              />
            )}
          />
          <TextField
            fullWidth
            type="datetime-local"
            label={t('trupp.uebergabeZeit')}
            value={zeit}
            onChange={(e) => {
              setZeit(e.target.value);
              setZeitGeaendert(true);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth
            type="number"
            label={t('trupp.druckUebergabe')}
            value={druck}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            onChange={(e) => setDruck(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleConfirm}>
          {t('trupp.actions.entsenden')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
