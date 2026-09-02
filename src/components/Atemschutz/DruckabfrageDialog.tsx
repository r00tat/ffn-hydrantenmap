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
   * Steuert **beides**: den Hinweis und die Vorbelegung des Hakens — und zwar
   * in dieser Richtung: Solange die Ankunft fehlt, bleibt der Haken leer.
   * Vorbelegt hätte jede gewöhnliche Zwischenabfrage als Ankunft gegolten, und
   * daraus rechnet sich der Rückmarschdruck; ein zu früh gesetzter Haken macht
   * ihn zu einer Behauptung. Ist die Ankunft dagegen schon gemeldet, ist sie
   * eine Tatsache — der Trupp *ist* am Einsatzziel, und ihn bei jeder weiteren
   * Abfrage als nicht angekommen anzubieten, widerspricht der Lage. Auf die
   * Rechnung wirkt das nicht: Maßgeblich bleibt die **erste** Zielmeldung
   * (`berechneStand`).
   */
  zielMeldungFehlt: boolean;
  /**
   * Ob der Rückzug schon gemeldet ist.
   *
   * Dieselbe Überlegung wie bei der Ankunft, in dieselbe Richtung: Ungemeldet
   * nicht vorbelegt — der Haken beendet die Warnungen, und das darf nicht aus
   * Versehen passieren. Ist er gemeldet, sind die Warnungen längst aus, und
   * jede weitere Abfrage kommt aus dem Rückmarsch.
   */
  rueckzugGemeldet: boolean;
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
  rueckzugGemeldet,
  onClose,
  onSave,
}: DruckabfrageDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [druck, setDruck] = useState('');
  // Was schon gemeldet ist, bleibt angekreuzt: Beides beschreibt einen
  // Zustand des Trupps und nicht ein Ereignis dieser einen Meldung.
  const [amZiel, setAmZiel] = useState(!zielMeldungFehlt);
  const [rueckzug, setRueckzug] = useState(rueckzugGemeldet);
  const [bemerkung, setBemerkung] = useState('');
  // Vorbelegt mit jetzt, aber änderbar: Die Meldung kommt über Funk und wird
  // eine Minute später eingetippt — mit dem Erfassungszeitpunkt gerechnet,
  // sähe der Verbrauch zu niedrig aus.
  const [zeit, setZeit] = useState(() => toLocalInput(new Date()));
  /**
   * Ob die Zeit von Hand geändert wurde.
   *
   * Wichtig für die **Sekunden**: `datetime-local` kennt nur Minuten, und der
   * unveränderte Wert würde die Erfassungszeit auf `:00` abschneiden. Bei einem
   * Standardgerät sind das rund 8 bar Verbrauch — genug, um den gemessenen
   * Verbrauch und damit die Rückzugsprognose zu verschieben, besonders wenn
   * zwei Abfragen kurz aufeinander folgen. Unverändert gilt deshalb der
   * genaue Zeitpunkt des Speicherns (`buildDruckabfrage` nimmt dann `jetzt`).
   */
  const [zeitGeaendert, setZeitGeaendert] = useState(false);
  const [saving, setSaving] = useState(false);

  const druckWert = druck.trim()
    ? Number(druck.trim().replace(',', '.'))
    : undefined;
  const input: DruckabfrageInput = {
    druck: druckWert,
    amZiel,
    rueckzug,
    bemerkung,
    // Ohne Änderung kein Zeitpunkt im Input — dann gilt der Moment des
    // Speicherns, samt Sekunden.
    ...(zeitGeaendert ? { zeitpunkt: fromLocalInput(zeit) } : {}),
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
            onChange={(e) => {
              setZeit(e.target.value);
              setZeitGeaendert(true);
            }}
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
            {/* Der Hinweistext folgt dem Haken: Steht er schon, ist „nicht
                ankreuzen für eine Zwischenabfrage" nicht mehr die Frage —
                dann muss dastehen, warum er gesetzt ist. */}
            {zielMeldungFehlt
              ? t('ueberwachung.amZielHint')
              : t('ueberwachung.bereitsGemeldet')}
          </Typography>
          {zielMeldungFehlt && !amZiel && (
            <Alert severity="info">{t('ueberwachung.amZielFehltHinweis')}</Alert>
          )}
          {/* Die Gegenmeldung zur Ankunft. Ungemeldet nicht vorbelegt: Sie
              beendet die Warnungen, und das darf nicht aus Versehen
              passieren. */}
          <FormControlLabel
            control={
              <Checkbox
                checked={rueckzug}
                onChange={(e) => setRueckzug(e.target.checked)}
              />
            }
            label={t('ueberwachung.rueckzug')}
          />
          <Typography variant="caption" color="text.secondary">
            {rueckzugGemeldet
              ? t('ueberwachung.bereitsGemeldet')
              : t('ueberwachung.rueckzugHint')}
          </Typography>
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
