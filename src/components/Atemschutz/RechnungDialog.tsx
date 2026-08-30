'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  FUELLUNG_TARIF_IDS,
  empfaengerFuerFeuerwehr,
  rechnungPositionen,
  rechnungSumme,
  type AtemschutzEmpfaenger,
  type FeuerwehrBuendel,
} from '../../common/atemschutzRechnung';
import { formatCurrency } from '../../common/kostenersatz';
import { fehlerText } from './rechnungFehler';
import EmpfaengerDialog from './EmpfaengerDialog';
import { createFuellungRechnung, type RechnungPositionWahl } from './rechnungActions';

export interface RechnungDialogProps {
  open: boolean;
  groupId: string;
  buendel: FeuerwehrBuendel;
  empfaenger: AtemschutzEmpfaenger[];
  preise: Record<string, number>;
  vorgabeTarif: string;
  volumen: Record<string, number>;
  /** Schreibweisen an den Flaschen — für das Feuerwehr-Feld im Empfänger. */
  feuerwehren: string[];
  onClose: () => void;
  onCreated: (rechnungId: string) => void;
}

function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RechnungDialog({
  open,
  groupId,
  buendel,
  empfaenger,
  preise,
  vorgabeTarif,
  volumen,
  feuerwehren,
  onClose,
  onCreated,
}: RechnungDialogProps) {
  const t = useTranslations('atemschutz');
  const format = useFormatter();

  const [gewaehlt, setGewaehlt] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(buendel.fuellungen.map((f) => [f.id as string, true])),
  );
  // Leerer Eintrag heißt: Vorgabetarif. So bleibt eine spätere Änderung der
  // Vorgabe an den noch nicht angehakten Zeilen wirksam.
  const [tarife, setTarife] = useState<Record<string, string>>({});
  const [empfaengerId, setEmpfaengerId] = useState<string>(
    () => empfaengerFuerFeuerwehr(empfaenger, buendel.feuerwehr)?.id ?? '',
  );
  const [datum, setDatum] = useState(heute);
  const [bemerkung, setBemerkung] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [speichert, setSpeichert] = useState(false);
  const [empfaengerOffen, setEmpfaengerOffen] = useState(false);

  const gewaehlteFuellungen = useMemo(
    () => buendel.fuellungen.filter((f) => gewaehlt[f.id as string]),
    [buendel.fuellungen, gewaehlt],
  );

  // Dieselbe Rechenregel wie in der Action — der Dialog zeigt keinen anderen
  // Betrag, als am Ende auf der Rechnung steht.
  const positionen = useMemo(() => {
    if (Object.keys(preise).length === 0) return [];
    return rechnungPositionen(
      gewaehlteFuellungen.map((fuellung) => ({
        fuellung,
        volumenLiter: fuellung.geraetId ? volumen[fuellung.geraetId] : undefined,
        tarifId: tarife[fuellung.id as string],
      })),
      preise,
      vorgabeTarif,
    );
  }, [gewaehlteFuellungen, tarife, volumen, preise, vorgabeTarif]);

  const alleAufTarif = (tarifId: string) => {
    setTarife((vorher) => {
      const naechste = { ...vorher };
      for (const fuellung of gewaehlteFuellungen) {
        naechste[fuellung.id as string] = tarifId;
      }
      return naechste;
    });
  };

  const handleCreate = async () => {
    setSpeichert(true);
    setFehler(undefined);
    const wahl: RechnungPositionWahl[] = gewaehlteFuellungen.map((f) => ({
      fuellungId: f.id as string,
      tarifId: tarife[f.id as string],
    }));
    const result = await createFuellungRechnung({
      groupId,
      positionen: wahl,
      empfaengerId,
      datum: new Date(datum).toISOString(),
      bemerkung,
    });
    setSpeichert(false);
    if (result.success && result.id) {
      onCreated(result.id);
      return;
    }
    setFehler(result.error ?? 'saveFailed');
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {t('rechnung.createTitle', {
          feuerwehr: buendel.feuerwehr || t('rechnung.ohneFeuerwehr'),
        })}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {fehler && <Alert severity="error">{fehlerText(t, fehler)}</Alert>}

          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
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
            <Button onClick={() => setEmpfaengerOffen(true)}>{t('rechnung.empfaengerNeu')}</Button>
            <TextField
              label={t('rechnung.datum')}
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2">{t('rechnung.alleAufTarif')}</Typography>
            <ToggleButtonGroup size="small" exclusive value={null}>
              {FUELLUNG_TARIF_IDS.map((tarifId) => (
                <ToggleButton key={tarifId} value={tarifId} onClick={() => alleAufTarif(tarifId)}>
                  {tarifId}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>{t('rechnung.spalteDatum')}</TableCell>
                <TableCell>{t('rechnung.spalteFlasche')}</TableCell>
                <TableCell>{t('rechnung.spalteEinsatz')}</TableCell>
                <TableCell align="right">{t('rechnung.spalteAnzahl')}</TableCell>
                <TableCell>{t('rechnung.spalteTarif')}</TableCell>
                <TableCell align="right">{t('rechnung.spaltePreis')}</TableCell>
                <TableCell align="right">{t('rechnung.spalteSumme')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {buendel.fuellungen.map((fuellung) => {
                const id = fuellung.id as string;
                const tarifId = tarife[id] ?? vorgabeTarif;
                const preis = preise[tarifId] ?? 0;
                const liter = fuellung.geraetId ? volumen[fuellung.geraetId] : undefined;
                return (
                  <TableRow key={id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={!!gewaehlt[id]}
                        onChange={(e) => setGewaehlt((v) => ({ ...v, [id]: e.target.checked }))}
                      />
                    </TableCell>
                    <TableCell>
                      {format.dateTime(new Date(fuellung.zeitpunkt), {
                        dateStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell>
                      {fuellung.flaschenNummer ?? '—'}
                      {liter ? ` (${liter} l)` : ''}
                    </TableCell>
                    <TableCell>{fuellung.firecallName ?? ''}</TableCell>
                    <TableCell align="right">{fuellung.anzahl}</TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        value={tarifId}
                        onChange={(e) => setTarife((v) => ({ ...v, [id]: e.target.value }))}
                        sx={{ minWidth: 100 }}
                      >
                        {FUELLUNG_TARIF_IDS.map((option) => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell align="right">{formatCurrency(preis)}</TableCell>
                    <TableCell align="right">{formatCurrency(preis * fuellung.anzahl)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Typography variant="h6" sx={{ textAlign: 'right' }}>
            {t('rechnung.summe')}: {formatCurrency(rechnungSumme(positionen))}
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
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!empfaengerId || positionen.length === 0 || speichert}
        >
          {t('rechnung.create')}
        </Button>
      </DialogActions>

      {empfaengerOffen && (
        <EmpfaengerDialog
          open
          groupId={groupId}
          feuerwehrVorgabe={buendel.feuerwehr}
          feuerwehren={feuerwehren}
          onClose={() => setEmpfaengerOffen(false)}
          onSaved={(id) => setEmpfaengerId(id)}
        />
      )}
    </Dialog>
  );
}
