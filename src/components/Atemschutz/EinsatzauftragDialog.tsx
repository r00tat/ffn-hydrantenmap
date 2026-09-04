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
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  sanitizePersonen,
  truppLabel,
  type AtemschutzTrupp,
} from '../../common/atemschutz';
import { fromLocalInput, toLocalInput } from '../../common/zeitEingabe';

export interface EinsatzauftragEingabe {
  entsendetAn: string;
  auftrag: string;
  einsatzziel: string;
  ueberwachtVon: string;
  abmarschZeit: string;
  druckAbmarsch?: number;
}

export interface EinsatzauftragDialogProps {
  open: boolean;
  trupp: AtemschutzTrupp;
  /** Fahrzeuge und taktische Einheiten des Einsatzes. */
  einheitVorschlaege: string[];
  /** Namen aus dem Einsatz — Mannschaft, ASSP-Leitung, Truppmitglieder. */
  personSuggestions: string[];
  /** Die Einheit des Reiters bzw. des Geräts, falls am Trupp keine steht. */
  einheitVorgabe?: string;
  onClose: () => void;
  onSave: (eingabe: EinsatzauftragEingabe) => Promise<void>;
}

/**
 * Der Einsatzauftrag der taktischen Einheit — hier geht der Trupp unter
 * Atemschutz.
 *
 * Der Dialog gibt eine **Eingabe** heraus und keinen fertigen Patch, anders als
 * `TruppZuteilungDialog`: Der Patch übernimmt zugleich die Zeitkontrolle und
 * braucht dafür die eigene `uid` und den bisherigen Zustand der Zeile — beides
 * liegt auf der Seite, nicht im Dialog.
 *
 * Der Gerätesatz fehlt bewusst: Im Regelfall ist er die Vorgabe aus dem eigenen
 * Flaschenbestand, und wenn er abweicht, steht er im Übernahme-Dialog. Sechs
 * Felder sind schon viel für ein Formular, das jemand mit Handschuhen bedient.
 */
export default function EinsatzauftragDialog({
  open,
  trupp,
  einheitVorschlaege,
  personSuggestions,
  einheitVorgabe,
  onClose,
  onSave,
}: EinsatzauftragDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  // Bereinigt und ohne Dubletten: Der Name **ist** der Schlüssel der
  // Autocomplete-Option, und ein doppelter lässt React warnen.
  const namen = useMemo(
    () => sanitizePersonen(personSuggestions),
    [personSuggestions],
  );

  const [entsendetAn, setEntsendetAn] = useState(
    trupp.entsendetAn ?? einheitVorgabe ?? '',
  );
  const [auftrag, setAuftrag] = useState(trupp.auftrag ?? '');
  const [einsatzziel, setEinsatzziel] = useState(trupp.einsatzziel ?? '');
  const [ueberwachtVon, setUeberwachtVon] = useState(trupp.ueberwachtVon ?? '');
  const [zeit, setZeit] = useState(() => toLocalInput(new Date()));
  /** s. `TruppZuteilungDialog` — entscheidet über die Sekunden. */
  const [zeitGeaendert, setZeitGeaendert] = useState(false);
  // Vorbelegt aus der Übergabe: Am Sammelplatz wurde oft schon abgelesen, und
  // zwischen Übergabe und Anschließen ändert sich der Flaschendruck nicht.
  const [druck, setDruck] = useState(
    trupp.druckUebergabe != null ? String(trupp.druckUebergabe) : '',
  );
  const [saving, setSaving] = useState(false);

  const druckWert = druck.trim()
    ? Number(druck.trim().replace(',', '.'))
    : undefined;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        entsendetAn,
        auftrag,
        einsatzziel,
        ueberwachtVon,
        abmarschZeit:
          (zeitGeaendert ? fromLocalInput(zeit) : undefined) ??
          new Date().toISOString(),
        druckAbmarsch: Number.isFinite(druckWert) ? druckWert : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('ueberwachung.einsatzauftragTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {truppLabel(trupp)}
          </Typography>
          {/* Was der Knopf tut, steht im Dialog: „In den Einsatz schicken"
              sagt nicht von selbst, dass danach die Uhr läuft und das Telefon
              läutet. */}
          <Alert severity="info">
            {t('ueberwachung.einsatzauftragHinweis')}
          </Alert>
          <Autocomplete
            freeSolo
            fullWidth
            options={einheitVorschlaege}
            value={entsendetAn}
            onInputChange={(_, next) => setEntsendetAn(next ?? '')}
            onChange={(_, next) =>
              setEntsendetAn(typeof next === 'string' ? next : '')
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('ueberwachung.truppEinheit')}
                helperText={t('ueberwachung.truppEinheitHint')}
              />
            )}
          />
          {/* Das WAS vor dem WO — in dieser Reihenfolge wird der Befehl
              gegeben. */}
          <TextField
            fullWidth
            label={t('ueberwachung.auftrag')}
            helperText={t('ueberwachung.auftragHint')}
            value={auftrag}
            onChange={(e) => setAuftrag(e.target.value)}
          />
          <TextField
            fullWidth
            label={t('ueberwachung.einsatzziel')}
            helperText={t('ueberwachung.einsatzzielHint')}
            value={einsatzziel}
            onChange={(e) => setEinsatzziel(e.target.value)}
          />
          <Autocomplete
            freeSolo
            fullWidth
            options={namen}
            value={ueberwachtVon}
            onInputChange={(_, next) => setUeberwachtVon(next ?? '')}
            onChange={(_, next) =>
              setUeberwachtVon(typeof next === 'string' ? next : '')
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('ueberwachung.ueberwachtVon')}
                helperText={t('ueberwachung.ueberwachtVonHint')}
              />
            )}
          />
          <TextField
            fullWidth
            type="datetime-local"
            label={t('ueberwachung.abmarschZeit')}
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
            label={t('trupp.druckAbmarsch')}
            value={druck}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            onChange={(e) => setDruck(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          {t('ueberwachung.actions.einsatzauftrag')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
