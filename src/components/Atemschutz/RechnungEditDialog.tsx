'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FUELLUNG_TARIF_IDS,
  type AtemschutzEmpfaenger,
  type AtemschutzRechnung,
} from '../../common/atemschutzRechnung';
import { formatCurrency } from '../../common/kostenersatz';
import { fehlerText } from './rechnungFehler';
import { updateFuellungRechnung } from './rechnungActions';

export interface RechnungEditDialogProps {
  open: boolean;
  groupId: string;
  rechnung: AtemschutzRechnung;
  empfaenger: AtemschutzEmpfaenger[];
  onClose: () => void;
  onSaved: () => void;
}

export default function RechnungEditDialog({
  open,
  groupId,
  rechnung,
  empfaenger,
  onClose,
  onSaved,
}: RechnungEditDialogProps) {
  const t = useTranslations('atemschutz');
  const format = useFormatter();

  const [empfaengerId, setEmpfaengerId] = useState(rechnung.empfaengerId ?? '');
  const [datum, setDatum] = useState(rechnung.datum.slice(0, 10));
  const [bemerkung, setBemerkung] = useState(rechnung.bemerkung ?? '');
  const [tarife, setTarife] = useState<Record<string, string>>(() =>
    Object.fromEntries(rechnung.positionen.map((p) => [p.fuellungId, p.rateId])),
  );
  const [fehler, setFehler] = useState<string>();
  const [speichert, setSpeichert] = useState(false);

  const handleSave = async () => {
    setSpeichert(true);
    setFehler(undefined);
    const result = await updateFuellungRechnung({
      groupId,
      rechnungId: rechnung.id as string,
      empfaengerId,
      datum: new Date(datum).toISOString(),
      bemerkung,
      tarife,
    });
    setSpeichert(false);
    if (result.success) {
      onSaved();
      onClose();
      return;
    }
    setFehler(result.error ?? 'saveFailed');
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('rechnung.bearbeitenTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {fehler && <Alert severity="error">{fehlerText(t, fehler)}</Alert>}

          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <TextField
              select
              label={t('rechnung.empfaenger')}
              value={empfaengerId}
              onChange={(e) => setEmpfaengerId(e.target.value)}
              sx={{ minWidth: 260 }}
              required
            >
              {empfaenger
                .filter((e) => e.active)
                .map((e) => (
                  <MenuItem key={e.id} value={e.id}>
                    {e.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label={t('rechnung.datum')}
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          {/* Positionen kommen weder hinzu noch weg — das gäbe Füllungen frei
              bzw. bände neue. Dafür gibt es Storno und Neuanlage. Der Tarif
              ist die Entscheidung, die sich hier ändern lässt. */}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('rechnung.spalteDatum')}</TableCell>
                <TableCell>{t('rechnung.spalteFlasche')}</TableCell>
                <TableCell align="right">{t('rechnung.spalteAnzahl')}</TableCell>
                <TableCell>{t('rechnung.spalteTarif')}</TableCell>
                <TableCell align="right">{t('rechnung.spalteSumme')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rechnung.positionen.map((position) => (
                <TableRow key={position.fuellungId}>
                  <TableCell>
                    {format.dateTime(new Date(position.zeitpunkt), {
                      dateStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell>{position.flaschenNummer ?? '—'}</TableCell>
                  <TableCell align="right">{position.anzahl}</TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={tarife[position.fuellungId] ?? position.rateId}
                      onChange={(e) =>
                        setTarife((v) => ({
                          ...v,
                          [position.fuellungId]: e.target.value,
                        }))
                      }
                      sx={{ minWidth: 100 }}
                    >
                      {FUELLUNG_TARIF_IDS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">{formatCurrency(position.summe)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary">
            {t('rechnung.tarifNeuBerechnet')}
          </Typography>

          <TextField
            label={t('rechnung.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('rechnung.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!empfaengerId || speichert}>
          {t('rechnung.speichern')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
