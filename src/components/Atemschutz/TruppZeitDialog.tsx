'use client';

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import {
  entsendePatch,
  rueckkehrPatch,
  type TruppPatch,
} from '../../common/atemschutz';

export type TruppZeitModus = 'entsenden' | 'rueckkehr';

/**
 * Von wo aus der Dialog geöffnet wird — er beschriftet sich danach und lässt
 * ein Feld weg.
 *
 * Am **Sammelplatz** ist „Entsendet an" die entscheidende Angabe: Dort wird ein
 * Trupp an eine taktische Einheit *abgegeben*, und wer nicht festhält, an
 * welche, verliert die Spur. Bei der **Überwachung** steht der Gruppenkommandant
 * selbst davor — er schickt den Trupp in *seinen* Einsatz und hat niemanden, an
 * den er ihn übergibt. Das Feld wäre dort eine Frage, auf die es keine Antwort
 * gibt.
 */
export type TruppZeitKontext = 'sammelplatz' | 'ueberwachung';

export interface TruppZeitDialogProps {
  open: boolean;
  modus: TruppZeitModus;
  /** Ohne Angabe der Sammelplatz — der Aufrufer, den es zuerst gab. */
  kontext?: TruppZeitKontext;
  /** Vorbelegung aus der vorigen Bereitstellung desselben Trupps. */
  entsendetAnVorschlag?: string;
  /** Fahrzeuge des Einsatzes zuerst, dann die Gruppenkommandanten. */
  entsendetAnVorschlaege: string[];
  onClose: () => void;
  onConfirm: (patch: TruppPatch) => Promise<void>;
}

/**
 * `datetime-local` erwartet `YYYY-MM-DDTHH:mm` in *lokaler* Zeit — ein
 * ISO-String mit `Z` würde als UTC gelesen und läge in Österreich ein bis zwei
 * Stunden daneben.
 */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Zurück nach ISO. Eine unlesbare Eingabe ergibt den Jetzt-Zeitpunkt. */
function fromLocalInput(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export default function TruppZeitDialog({
  open,
  modus,
  kontext = 'sammelplatz',
  entsendetAnVorschlag,
  entsendetAnVorschlaege,
  onClose,
  onConfirm,
}: TruppZeitDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [zeit, setZeit] = useState(() => toLocalInput(new Date()));
  const [druck, setDruck] = useState('');
  const [entsendetAn, setEntsendetAn] = useState(entsendetAnVorschlag ?? '');
  const [saving, setSaving] = useState(false);

  const istEntsenden = modus === 'entsenden';
  const istUeberwachung = kontext === 'ueberwachung';
  // Nur am Sammelplatz wird nach dem Ziel gefragt — s. `TruppZeitKontext`.
  const fragtZiel = istEntsenden && !istUeberwachung;
  const druckWert = druck.trim() ? Number(druck.trim().replace(',', '.')) : undefined;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const patch = istEntsenden
        ? entsendePatch({
            // Bei der Überwachung nicht mitgeschickt und damit auch nicht
            // gelöscht: `entsendePatch` lässt das Feld dann aus dem Patch weg,
            // ein am Sammelplatz gesetztes Ziel bleibt also stehen.
            entsendetAn: fragtZiel ? entsendetAn : undefined,
            abmarschZeit: fromLocalInput(zeit),
            druckAbmarsch: Number.isFinite(druckWert) ? druckWert : undefined,
          })
        : rueckkehrPatch({
            rueckkehrZeit: fromLocalInput(zeit),
            druckRueckkehr: Number.isFinite(druckWert) ? druckWert : undefined,
          });
      await onConfirm(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {!istEntsenden
          ? t('trupp.rueckkehrTitle')
          : istUeberwachung
            ? t('ueberwachung.einsatzTitle')
            : t('trupp.entsendenTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {fragtZiel && (
            // Freitext mit Vorschlägen: Der Trupp geht meist zu einem
            // Fahrzeug, manchmal zu einem Gruppenkommandanten und
            // gelegentlich zu einem Abschnitt, den es in keiner Liste gibt.
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
          )}
          <TextField
            fullWidth
            type="datetime-local"
            label={
              !istEntsenden
                ? t('trupp.rueckkehrZeit')
                : istUeberwachung
                  ? // Die Unterlage definiert den Zeitpunkt genau so: „Uhrzeit
                    // beim Anschließen des Luftversorgungssystems".
                    t('ueberwachung.abmarschZeit')
                  : t('trupp.abmarschZeit')
            }
            value={zeit}
            onChange={(e) => setZeit(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth
            type="number"
            label={
              istEntsenden ? t('trupp.druckAbmarsch') : t('trupp.druckRueckkehr')
            }
            value={druck}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            onChange={(e) => setDruck(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleConfirm}>
          {!istEntsenden
            ? t('trupp.actions.rueckkehr')
            : istUeberwachung
              ? t('ueberwachung.actions.inDenEinsatz')
              : t('trupp.actions.entsenden')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
