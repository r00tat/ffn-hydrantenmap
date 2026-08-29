'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_SICHTKONTROLLE,
  SICHTKONTROLLE_WERTE,
  type AtemschutzGeraet,
  type Sichtkontrolle,
} from '../../common/atemschutz';
import GeraetBestaetigung from './GeraetBestaetigung';
import MangelFelder from './MangelFelder';
import {
  hatMangelEingabe,
  LEERE_MANGEL_EINGABE,
  saveAtemschutzMangel,
  useMangelFehlerText,
  type MangelEingabe,
} from './mangelErfassung';

export type AusgabeModus = 'ausgeben' | 'zuruecknehmen';

export interface AusgabePatch {
  status: 'ausgegeben' | 'zurueck';
  ausgegebenAn?: string;
  ausgabeZeit?: string;
  ruecknahmeZeit?: string;
  sichtkontrolle?: Sichtkontrolle;
  /** Der gleich mit erfasste Mangel. */
  mangelId?: string;
  bemerkung?: string;
}

export interface AusgabeDialogProps {
  open: boolean;
  modus: AusgabeModus;
  /** Für den Mangel, der aus der Sichtkontrolle entstehen kann. */
  groupId: string;
  geraet: AtemschutzGeraet;
  /** Truppnamen und Feuerwehren dieses Einsatzes. */
  empfaengerVorschlaege: string[];
  /** Vorbelegung beim Zurücknehmen. */
  ausgegebenAn?: string;
  onClose: () => void;
  onConfirm: (patch: AusgabePatch) => Promise<void>;
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function fromLocalInput(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export default function AusgabeDialog({
  open,
  modus,
  groupId,
  geraet,
  empfaengerVorschlaege,
  ausgegebenAn,
  onClose,
  onConfirm,
}: AusgabeDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const istAusgabe = modus === 'ausgeben';
  const [empfaenger, setEmpfaenger] = useState(ausgegebenAn ?? '');
  const [zeit, setZeit] = useState(() => toLocalInput(new Date()));
  const [sichtkontrolle, setSichtkontrolle] = useState<Sichtkontrolle>(
    DEFAULT_SICHTKONTROLLE,
  );
  const [bemerkung, setBemerkung] = useState('');
  const [mangel, setMangel] = useState<MangelEingabe>(LEERE_MANGEL_EINGABE);
  const [saving, setSaving] = useState(false);
  const [fehlermeldung, setFehlermeldung] = useState<string>();
  const fehlerText = useMangelFehlerText();

  const istMangel = sichtkontrolle === 'mangel';
  const fehler: string[] = [];
  if (istAusgabe && !empfaenger.trim()) fehler.push('ausgegebenAnMissing');
  // „Mangel" ohne Beschreibung ist kein Mangel, sondern eine Notiz, die
  // niemand wiederfindet: Wer den Zustand so setzt, muss auch sagen, was ist.
  if (istMangel && !hatMangelEingabe(mangel)) fehler.push('descriptionMissing');

  const handleConfirm = async () => {
    setSaving(true);
    setFehlermeldung(undefined);
    try {
      const iso = fromLocalInput(zeit);
      // Nur setzen, was einen Wert hat — Firestore lehnt `undefined` ab.
      const patch: AusgabePatch = istAusgabe
        ? {
            status: 'ausgegeben',
            ausgegebenAn: empfaenger.trim(),
            ausgabeZeit: iso,
          }
        : { status: 'zurueck', ruecknahmeZeit: iso };
      patch.sichtkontrolle = sichtkontrolle;
      if (bemerkung.trim()) patch.bemerkung = bemerkung.trim();

      // Der Mangel zuerst: Schlägt er fehl, soll die Ausgabe nicht mit einem
      // „Mangel" dastehen, zu dem es keinen Eintrag in der Mängelliste gibt.
      if (istMangel) {
        patch.mangelId = await saveAtemschutzMangel(
          groupId,
          geraet.id as string,
          mangel,
        );
      }

      await onConfirm(patch);
      onClose();
    } catch (err) {
      setFehlermeldung(fehlerText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {istAusgabe ? t('ausruestung.ausgabeTitle') : t('ausruestung.ruecknahmeTitle')}
      </DialogTitle>
      <DialogContent>
        {saving && <LinearProgress sx={{ mb: 2 }} />}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <GeraetBestaetigung geraet={geraet} />
          {istAusgabe && (
            <Autocomplete
              freeSolo
              fullWidth
              options={empfaengerVorschlaege}
              value={empfaenger}
              onInputChange={(_, next) => setEmpfaenger(next ?? '')}
              onChange={(_, next) =>
                setEmpfaenger(typeof next === 'string' ? next : '')
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  required
                  label={t('ausruestung.ausgegebenAn')}
                  helperText={t('ausruestung.ausgegebenAnHint')}
                />
              )}
            />
          )}
          <TextField
            fullWidth
            type="datetime-local"
            label={
              istAusgabe
                ? t('ausruestung.ausgabeZeit')
                : t('ausruestung.ruecknahmeZeit')
            }
            value={zeit}
            onChange={(e) => setZeit(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            fullWidth
            label={t('ausruestung.sichtkontrolle')}
            value={sichtkontrolle}
            onChange={(e) => setSichtkontrolle(e.target.value as Sichtkontrolle)}
          >
            {SICHTKONTROLLE_WERTE.map((wert) => (
              <MenuItem key={wert} value={wert}>
                {t(`sichtkontrolle.${wert}`)}
              </MenuItem>
            ))}
          </TextField>
          {istMangel && (
            <MangelFelder
              required
              value={mangel}
              helperText={t('ausruestung.mangelInlineHint')}
              onChange={setMangel}
            />
          )}
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t('ausruestung.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
          />
          {fehler.length > 0 && (
            <Alert severity="warning">
              {fehler
                .map((key) =>
                  t(
                    `ausruestung.errors.${key}` as 'ausruestung.errors.ausgegebenAnMissing',
                  ),
                )
                .join(' · ')}
            </Alert>
          )}
          {fehlermeldung && <Alert severity="error">{fehlermeldung}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={saving || fehler.length > 0}
          onClick={handleConfirm}
        >
          {istAusgabe
            ? t('ausruestung.actions.ausgeben')
            : t('ausruestung.actions.zuruecknehmen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
