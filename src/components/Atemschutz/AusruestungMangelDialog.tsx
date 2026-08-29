'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { geraetLabel, type AtemschutzGeraet } from '../../common/atemschutz';
import MangelFelder from './MangelFelder';
import {
  hatMangelEingabe,
  LEERE_MANGEL_EINGABE,
  saveAtemschutzMangel,
  useMangelFehlerText,
  type MangelEingabe,
} from './mangelErfassung';

export interface AusruestungMangelDialogProps {
  open: boolean;
  groupId: string;
  geraet: AtemschutzGeraet;
  onClose: () => void;
  /** Der angelegte Mangel — der Aufrufer schreibt die ID an die Ausgabe. */
  onSaved: (mangelId: string) => Promise<void>;
}

export default function AusruestungMangelDialog({
  open,
  groupId,
  geraet,
  onClose,
  onSaved,
}: AusruestungMangelDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const fehlerText = useMangelFehlerText();

  const [eingabe, setEingabe] = useState<MangelEingabe>(LEERE_MANGEL_EINGABE);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string>();

  const handleSave = async () => {
    setBusy(true);
    setFehler(undefined);
    try {
      const mangelId = await saveAtemschutzMangel(
        groupId,
        geraet.id as string,
        eingabe,
      );
      await onSaved(mangelId);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('ausruestung.mangelTitle')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {geraetLabel(geraet)}
          </Typography>
          <MangelFelder required value={eingabe} onChange={setEingabe} />
          {fehler && <Alert severity="error">{fehler}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={busy || !hatMangelEingabe(eingabe)}
          onClick={handleSave}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
