'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  PA_SAETZE,
  PA_TYPEN,
  truppLabel,
  type AtemschutzTrupp,
  type Geraetesatz,
  type PaTypKey,
} from '../../common/atemschutz';
import {
  geraetesatzVon,
  rechnerischeEinsatzdauerMin,
} from '../../common/atemschutzUeberwachung';

export interface UeberwachungEingabe {
  ueberwachtVon: string;
  einsatzziel: string;
  /** Die taktische Einheit, der der Trupp zugeordnet ist. */
  entsendetAn: string;
  paTyp: PaTypKey;
  satz: Geraetesatz;
}

export interface UeberwachungDialogProps {
  open: boolean;
  trupp: AtemschutzTrupp;
  /** Der Gerätesatz, der in dieser Feuerwehr der Regelfall ist. */
  vorgabe: Geraetesatz;
  /** Namen aus dem Einsatz — Mannschaft, ASSP-Leitung, Truppmitglieder. */
  personSuggestions: string[];
  /** Fahrzeuge und taktische Einheiten des Einsatzes. */
  einheitVorschlaege: string[];
  /** Ob die Verantwortung erstmals übernommen wird. */
  istUebernahme: boolean;
  onClose: () => void;
  onSave: (input: UeberwachungEingabe) => Promise<void>;
}

/**
 * Die Zeitkontrolle übernehmen oder ihre Angaben ändern.
 *
 * Was die Übernahme *tut* — und warum sie nicht bloß ein Formular ist: Sie hält
 * den Wechsel der Verantwortung vom Sammelplatz zum Gruppenkommandanten fest
 * (FH-06 5.3.4), trägt das Gerät des Übernehmenden in die Empfängerliste der
 * Warnungen ein und legt mit dem Gerätesatz die Grundlage fest, auf der Drittel-
 * und Rückzugszeitpunkt überhaupt gerechnet werden. Deshalb steht der Hinweis
 * oben im Dialog: „Zeitkontrolle übernehmen" allein sagt nicht, dass danach das
 * Telefon läutet.
 *
 * Der Gerätesatz steht hier und nicht am Trupp-Dialog des Sammelplatzes: Am
 * Sammelplatz wird ausgegeben, überwacht wird beim Gruppenkommandanten, und nur
 * dort wird gerechnet. Vorbelegt ist er aus dem eigenen Flaschenbestand — ohne
 * erfasste Flaschen bleibt der Standard-Pressluftatmer.
 */
export default function UeberwachungDialog({
  open,
  trupp,
  vorgabe,
  personSuggestions,
  einheitVorschlaege,
  istUebernahme,
  onClose,
  onSave,
}: UeberwachungDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [ueberwachtVon, setUeberwachtVon] = useState(trupp.ueberwachtVon ?? '');
  const [einsatzziel, setEinsatzziel] = useState(trupp.einsatzziel ?? '');
  const [entsendetAn, setEntsendetAn] = useState(trupp.entsendetAn ?? '');
  const [paTyp, setPaTyp] = useState<PaTypKey>(
    // Ohne Angabe am Trupp `custom` mit der Bestandsvorgabe: Das ist genau der
    // Satz, mit dem ohnehin gerechnet würde, und er steht damit sichtbar im
    // Formular statt still im Code.
    trupp.paTyp ?? 'custom',
  );
  const [satz, setSatz] = useState<Geraetesatz>(() =>
    geraetesatzVon(trupp, vorgabe),
  );
  const [saving, setSaving] = useState(false);

  const aktuellerSatz = paTyp === 'custom' ? satz : PA_SAETZE[paTyp];
  const dauer = rechnerischeEinsatzdauerMin(aktuellerSatz);

  const setSatzFeld = (feld: keyof Geraetesatz, wert: string) => {
    const zahl = Number(wert.replace(',', '.'));
    setSatz((prev) => ({
      ...prev,
      [feld]: Number.isFinite(zahl) && zahl > 0 ? zahl : 0,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ueberwachtVon,
        einsatzziel,
        entsendetAn,
        paTyp,
        satz: aktuellerSatz,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {istUebernahme
          ? t('ueberwachung.uebernehmenTitle')
          : t('ueberwachung.bearbeitenTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {truppLabel(trupp)}
          </Typography>
          {istUebernahme && (
            // Nur bei der Übernahme: Wer den Dialog später zum Bearbeiten
            // öffnet, hat die Kontrolle längst und braucht die Erklärung nicht
            // mehr.
            <Alert severity="info">{t('ueberwachung.uebernehmenHinweis')}</Alert>
          )}
          {/* Die Einheit steht oben: Sie ist die Frage, die vor allen anderen
              beantwortet ist — „welches Fahrzeug hat den Trupp?" —, und sie
              fehlt vollständig, wenn der Trupp nie über einen Sammelplatz lief. */}
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
            options={personSuggestions}
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
            select
            fullWidth
            label={t('ueberwachung.paTyp')}
            value={paTyp}
            onChange={(e) => setPaTyp(e.target.value as PaTypKey)}
          >
            {PA_TYPEN.map((key) => (
              <MenuItem key={key} value={key}>
                {t(`ueberwachung.paTypen.${key}` as 'ueberwachung.paTypen.custom')}
              </MenuItem>
            ))}
          </TextField>
          {paTyp === 'custom' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                type="number"
                label={t('ueberwachung.flaschenAnzahl')}
                value={satz.flaschenAnzahl || ''}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                onChange={(e) => setSatzFeld('flaschenAnzahl', e.target.value)}
              />
              <TextField
                fullWidth
                type="number"
                label={t('ueberwachung.flaschenVolumen')}
                value={satz.flaschenVolumen || ''}
                slotProps={{ htmlInput: { inputMode: 'decimal', step: 0.1 } }}
                onChange={(e) => setSatzFeld('flaschenVolumen', e.target.value)}
              />
              <TextField
                fullWidth
                type="number"
                label={t('ueberwachung.fuellDruck')}
                value={satz.fuellDruck || ''}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                onChange={(e) => setSatzFeld('fuellDruck', e.target.value)}
              />
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary">
            {t('ueberwachung.rechnerischeDauer', {
              minuten: Math.round(dauer),
            })}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={saving || !(dauer > 0)}
          onClick={handleSave}
        >
          {istUebernahme
            ? t('ueberwachung.actions.uebernehmen')
            : tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
