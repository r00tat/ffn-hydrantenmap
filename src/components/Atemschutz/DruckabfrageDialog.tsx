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
  type Druckabfrage,
  type DruckabfrageInput,
} from '../../common/atemschutz';
import { fromLocalInput, toLocalInput } from '../../common/zeitEingabe';

export interface DruckabfrageDialogProps {
  open: boolean;
  trupp: AtemschutzTrupp;
  /**
   * Ob die Ankunftsmeldung noch fehlt.
   *
   * Entscheidet, ob der Haken **überhaupt erscheint**: Die Ankunft am
   * Einsatzziel ist ein Ereignis und kein Zustand — es gibt sie genau einmal,
   * und maßgeblich ist die erste Meldung (`berechneStand`). Ist sie erfasst,
   * hat die nächste Abfrage dazu nichts mehr zu sagen; der Haken wäre eine
   * Frage ohne Antwortmöglichkeit.
   *
   * Vorher war er in diesem Fall vorbelegt. Das schrieb `amZiel` an *jede*
   * weitere Abfrage, und im Druckverlauf stand danach an jeder Zeile
   * „Ankunft" — die eine Meldung, auf die es ankommt, war nicht mehr zu
   * finden.
   */
  zielMeldungFehlt: boolean;
  /**
   * Ob der Rückzug schon angetreten ist.
   *
   * Dieselbe Überlegung wie bei der Ankunft: Ein zweites „Rückzug angetreten"
   * gibt es nicht. Solange er fehlt, ist der Haken da und **leer** — er
   * beendet die Warnungen, und das darf nicht aus Versehen passieren.
   */
  rueckzugGemeldet: boolean;
  /**
   * Eine schon erfasste Meldung, die korrigiert wird. Dann sind die Felder
   * vorbelegt, Ankunft und Rückzug stehen zur Wahl, wenn **diese** Meldung
   * sie trägt, und das Tagebuch bleibt unberührt — ein Eintrag dort ist
   * geschrieben und wird nicht nachgezogen.
   */
  abfrage?: Druckabfrage;
  onClose: () => void;
  onSave: (input: DruckabfrageInput) => Promise<void>;
  /** Nur beim Bearbeiten: die Meldung entfernen. */
  onDelete?: () => Promise<void>;
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
  abfrage,
  onClose,
  onSave,
  onDelete,
}: DruckabfrageDialogProps) {
  const isEdit = !!abfrage;
  // Beim Bearbeiten trägt womöglich genau diese Meldung die Ankunft oder den
  // Rückzug — dann muss der Haken da sein, sonst ließe sich ein versehentlich
  // gesetztes Ereignis nicht zurücknehmen.
  const showZiel = zielMeldungFehlt || !!abfrage?.amZiel;
  const showRueckzug = !rueckzugGemeldet || !!abfrage?.rueckzug;
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [druck, setDruck] = useState(
    typeof abfrage?.druck === 'number' ? String(abfrage.druck) : '',
  );
  // Nie vorbelegt: Beides ist ein Ereignis *dieser* Meldung. Was schon
  // gemeldet ist, wird gar nicht erst angeboten — s. `zielMeldungFehlt`.
  const [amZiel, setAmZiel] = useState(!!abfrage?.amZiel);
  const [rueckzug, setRueckzug] = useState(!!abfrage?.rueckzug);
  const [bemerkung, setBemerkung] = useState(abfrage?.bemerkung ?? '');
  // Vorbelegt mit jetzt, aber änderbar: Die Meldung kommt über Funk und wird
  // eine Minute später eingetippt — mit dem Erfassungszeitpunkt gerechnet,
  // sähe der Verbrauch zu niedrig aus.
  const [zeit, setZeit] = useState(() =>
    toLocalInput(abfrage ? new Date(abfrage.zeitpunkt) : new Date()),
  );
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
  /**
   * Ob diese Meldung ins Einsatztagebuch soll. Vorgabe **aus**: Eine
   * gewöhnliche Zwischenabfrage ist Sache der Zeitkontrolle, nicht der
   * Einsatzleitung — stünde jede darin, gingen die vier wichtigen Zeilen unter.
   */
  const [tagebuch, setTagebuch] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Löschen fragt im Dialog nach — `confirm()` gibt es nicht überall. */
  const [confirmDelete, setConfirmDelete] = useState(false);

  const druckWert = druck.trim()
    ? Number(druck.trim().replace(',', '.'))
    : undefined;
  // Ankunft und Rückzug sind Einsatzereignisse und gehen **immer** ins
  // Tagebuch. Der Haken ist dann gesetzt und gesperrt statt still übergangen:
  // Ein Eintrag, den der Dialog verneint hat, wäre eine Überraschung.
  //
  // Ohne weitere Bedingung: Beide Haken gibt es nur, solange das Ereignis
  // noch nicht gemeldet ist — gesetzt heißt hier also immer „neu".
  // Beim Bearbeiten entsteht kein Tagebucheintrag; der Haken entfällt.
  const zwingend = !isEdit && (amZiel || rueckzug);
  const input: DruckabfrageInput = {
    druck: druckWert,
    amZiel,
    rueckzug,
    bemerkung,
    tagebuch: !isEdit && (tagebuch || zwingend),
    // Ohne Änderung kein Zeitpunkt im Input — dann gilt der Moment des
    // Speicherns, samt Sekunden; beim Bearbeiten der erfasste Zeitpunkt.
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

  const handleDelete = async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {isEdit
          ? t('ueberwachung.meldungBearbeitenTitle')
          : t('ueberwachung.druckabfrageTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {truppLabel(trupp)}
          </Typography>
          <TextField
            fullWidth
            autoFocus
            type="number"
            label={t('ueberwachung.druck')}
            helperText={`${t('ueberwachung.druckHint')} ${t('ueberwachung.druckOptionalHint')}`}
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
          {/* Nur solange die Ankunft fehlt. Ist sie gemeldet, hat diese
              Abfrage dazu nichts zu sagen — und ein vorbelegter Haken schrieb
              sie an jede weitere Zeile. */}
          {showZiel && (
            <>
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
              {/* Nicht mehr, sobald dieselbe Meldung den Rückzug trägt: Dann
                  ist die Ankunft nachzutragen zwecklos, der Trupp kommt
                  zurück. */}
              {!isEdit && !amZiel && !rueckzug && (
                <Alert severity="info">
                  {t('ueberwachung.amZielFehltHinweis')}
                </Alert>
              )}
            </>
          )}
          {/* Die Gegenmeldung zur Ankunft, ebenfalls nur einmal. Ungemeldet
              nicht vorbelegt: Sie beendet die Warnungen, und das darf nicht
              aus Versehen passieren. */}
          {showRueckzug && (
            <>
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
                {t('ueberwachung.rueckzugHint')}
              </Typography>
            </>
          )}
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t('ueberwachung.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
          />
          {isEdit ? (
            <Typography variant="caption" color="text.secondary">
              {t('ueberwachung.korrekturTagebuchHinweis')}
            </Typography>
          ) : (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={tagebuch || zwingend}
                    disabled={zwingend}
                    onChange={(e) => setTagebuch(e.target.checked)}
                  />
                }
                label={t('ueberwachung.tagebuch')}
              />
              <Typography variant="caption" color="text.secondary">
                {zwingend
                  ? t('ueberwachung.tagebuchImmer')
                  : t('ueberwachung.tagebuchHint')}
              </Typography>
            </>
          )}
          {confirmDelete && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  disabled={saving}
                  onClick={handleDelete}
                >
                  {tCommon('delete')}
                </Button>
              }
            >
              {t('ueberwachung.meldungLoeschenBestaetigen')}
            </Alert>
          )}
          {/* Vorher an „Druck ist getippt" gehängt, weil der leere Dialog
              sonst sofort meckerte. Jetzt hat der Fehler einen anderen Sinn:
              `leereMeldung` heißt „hier steht gar nichts" und darf erst
              erscheinen, wenn jemand etwas angefasst hat. */}
          {fehler.length > 0 && (druck.trim() !== '' || bemerkung !== '') && (
            <Alert severity="warning">
              {fehler
                .map((key) =>
                  t(
                    `ueberwachung.errors.${key}` as 'ueberwachung.errors.druckInvalid',
                  ),
                )
                .join(' · ')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {isEdit && onDelete && (
          <Button
            color="error"
            disabled={saving || confirmDelete}
            onClick={() => setConfirmDelete(true)}
            sx={{ mr: 'auto' }}
          >
            {t('ueberwachung.meldungLoeschen')}
          </Button>
        )}
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
