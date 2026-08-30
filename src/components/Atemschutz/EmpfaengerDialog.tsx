'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { normalizeCode } from '../../common/atemschutz';
import type { AtemschutzEmpfaenger } from '../../common/atemschutzRechnung';
import { saveAtemschutzEmpfaenger } from './rechnungActions';

export interface EmpfaengerDialogProps {
  open: boolean;
  groupId: string;
  /** Vorhandener Eintrag zum Ändern; ohne ihn wird angelegt. */
  empfaenger?: AtemschutzEmpfaenger;
  /** Vorbelegung der Feuerwehr beim Anlegen aus einem Bündel heraus. */
  feuerwehrVorgabe?: string;
  /**
   * Die Schreibweisen, die an den Flaschen stehen. Der Zuordnungsschlüssel
   * ist genau dieses Feld — deshalb zur Auswahl statt als Freitext.
   */
  feuerwehren: string[];
  onClose: () => void;
  onSaved: (empfaengerId: string) => void;
}

export default function EmpfaengerDialog({
  open,
  groupId,
  empfaenger,
  feuerwehrVorgabe,
  feuerwehren,
  onClose,
  onSaved,
}: EmpfaengerDialogProps) {
  const t = useTranslations('atemschutz');
  const [feuerwehr, setFeuerwehr] = useState(
    empfaenger?.feuerwehr ?? feuerwehrVorgabe ?? '',
  );
  const [name, setName] = useState(empfaenger?.name ?? '');
  const [ansprechpartner, setAnsprechpartner] = useState(
    empfaenger?.ansprechpartner ?? '',
  );
  const [adresse, setAdresse] = useState(empfaenger?.adresse ?? '');
  const [email, setEmail] = useState(empfaenger?.email ?? '');
  const [telefon, setTelefon] = useState(empfaenger?.telefon ?? '');
  const [active, setActive] = useState(empfaenger?.active !== false);
  const [fehler, setFehler] = useState<string>();
  const [speichert, setSpeichert] = useState(false);

  // Dieselbe Prüfung wie in der Action — der Fehler soll vor dem Absenden
  // auffallen, nicht erst als Rückmeldung vom Server.
  const unvollstaendig = !feuerwehr.trim() || !name.trim() || !email.trim();

  // Der Abgleich läuft über `normalizeCode` gegen die Feuerwehr an der
  // Flasche. „FF Podersdorf" trifft „Podersdorf" damit *nicht* — ohne diesen
  // Hinweis fiele das erst auf, wenn die Rechnung keinen Empfänger findet.
  const passtZuKeiner =
    !!feuerwehr.trim() &&
    feuerwehren.length > 0 &&
    !feuerwehren.some((f) => normalizeCode(f) === normalizeCode(feuerwehr));

  const handleSave = async () => {
    setSpeichert(true);
    setFehler(undefined);
    const result = await saveAtemschutzEmpfaenger({
      groupId,
      empfaengerId: empfaenger?.id,
      input: {
        feuerwehr,
        name,
        ansprechpartner,
        adresse,
        email,
        telefon,
        active,
      },
    });
    setSpeichert(false);
    if (result.success && result.id) {
      onSaved(result.id);
      onClose();
      return;
    }
    setFehler(result.error ?? 'saveFailed');
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {empfaenger
          ? t('empfaenger.editTitle')
          : t('empfaenger.createTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {fehler && <Alert severity="error">{t(`errors.${fehler}` as 'errors.saveFailed')}</Alert>}
          <Autocomplete
            freeSolo
            options={feuerwehren}
            value={feuerwehr}
            onChange={(_, wert) => setFeuerwehr(wert ?? '')}
            onInputChange={(_, wert) => setFeuerwehr(wert)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('empfaenger.feuerwehr')}
                required
                fullWidth
                error={passtZuKeiner}
                helperText={
                  passtZuKeiner
                    ? t('empfaenger.feuerwehrKeinTreffer')
                    : t('empfaenger.feuerwehrHelp')
                }
              />
            )}
          />
          <TextField
            label={t('empfaenger.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label={t('empfaenger.ansprechpartner')}
            value={ansprechpartner}
            onChange={(e) => setAnsprechpartner(e.target.value)}
            fullWidth
          />
          <TextField
            label={t('empfaenger.adresse')}
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            label={t('empfaenger.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            fullWidth
          />
          <TextField
            label={t('empfaenger.telefon')}
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
            }
            label={t('empfaenger.active')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('empfaenger.cancel')}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={unvollstaendig || speichert}
        >
          {t('empfaenger.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
