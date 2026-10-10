'use client';

import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import BekleidungScanDialog from './BekleidungScanDialog';
import { returnItems } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import {
  findStueckByCode,
  personItems,
  stueckLabel,
  todayLocalDate,
  type BekleidungView,
} from './bekleidungUi';

export interface RuecknahmeDialogProps {
  open: boolean;
  view: BekleidungView;
  initialPersonId?: string;
  onClose: () => void;
}

/**
 * Rücknahme von einer Person: ihre ausgegebenen Stücke abhaken (oder
 * scannen) und bei Mengenartikeln die zurückgegebene Anzahl eintragen. Ziel
 * ist das Lager oder das Ausscheiden.
 */
export default function RuecknahmeDialog({
  open,
  view,
  initialPersonId,
  onClose,
}: RuecknahmeDialogProps) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const [personId, setPersonId] = useState(initialPersonId ?? '');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [mengen, setMengen] = useState<Record<string, string>>({});
  const [datum, setDatum] = useState(todayLocalDate);
  const [ziel, setZiel] = useState<'lager' | 'ausgeschieden'>('lager');
  const [bemerkung, setBemerkung] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const labelOf = (id: string) => {
    const s = view.stueckById.get(id);
    return s ? stueckLabel(s, view.artikelById) : id;
  };
  // Fehler `notIssued:<id>` nennen bei Mengen die ID der Ausgabe.
  const errorLabelOf = (id: string) => {
    if (view.stueckById.has(id)) return labelOf(id);
    const a = view.ausgaben.find((x) => x.id === id);
    if (!a) return id;
    return `${view.artikelById.get(a.artikelId)?.bezeichnung ?? a.artikelId} · ${a.groesse}`;
  };

  const pieces = useMemo(
    () => view.stuecke.filter((s) => s.personId === personId && s.status === 'ausgegeben'),
    [view.stuecke, personId],
  );
  // Aus dem Import: ausgegeben, aber ohne benannte Person. Sie stehen ohne
  // gewählte Person zur Wahl; gescannt kommen sie immer dazu.
  const unknownPersonPieces = useMemo(
    () => view.stuecke.filter((s) => s.id && s.status === 'ausgegeben' && !s.personId),
    [view.stuecke],
  );
  const showUnknown =
    unknownPersonPieces.length > 0 &&
    (!personId || unknownPersonPieces.some((s) => checked.has(s.id!)));
  const mengeAusgaben = useMemo(
    () => (personId ? personItems(personId, view.ausgaben).current.filter((a) => !a.stueckId) : []),
    [view.ausgaben, personId],
  );

  const choosePerson = (id: string) => {
    setPersonId(id);
    setChecked(new Set());
    setMengen({});
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCode = (code: string) => {
    const stueck = findStueckByCode(view.stuecke, code);
    if (!stueck?.id) {
      setMessage(t('collector.notFound', { code }));
      return;
    }
    if (stueck.status !== 'ausgegeben') {
      setMessage(t('ruecknahme.notIssued', { stueck: labelOf(stueck.id) }));
      return;
    }
    setMessage(undefined);
    if (!stueck.personId) {
      setChecked((prev) => new Set(prev).add(stueck.id!));
      return;
    }
    if (stueck.personId !== personId) {
      setPersonId(stueck.personId);
      setMengen({});
      setChecked(new Set([stueck.id]));
      return;
    }
    setChecked((prev) => new Set(prev).add(stueck.id!));
  };

  const mengenLines = mengeAusgaben
    .map((a) => ({ ausgabeId: a.id ?? '', menge: Number(mengen[a.id ?? ''] ?? 0) }))
    .filter((l) => l.ausgabeId && Number.isInteger(l.menge) && l.menge > 0);
  const canSubmit = !!datum && (checked.size > 0 || mengenLines.length > 0) && !busy;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      returnItems(view.groupId, {
        datum,
        bemerkung: bemerkung.trim() || undefined,
        ziel,
        stueckIds: [...checked],
        mengen: mengenLines,
      }),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error, { stueckLabel: errorLabelOf }));
      return;
    }
    onClose();
  };

  const personOptions = view.persons;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('ruecknahme.title')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Autocomplete
              options={personOptions}
              value={personOptions.find((p) => p.id === personId) ?? null}
              onChange={(_, value) => choosePerson(value?.id ?? '')}
              getOptionLabel={(p) => p.name}
              getOptionKey={(p) => p.id ?? p.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label={t('fields.person')} />}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="outlined"
              startIcon={<QrCodeScannerIcon />}
              onClick={() => setScanOpen(true)}
            >
              {t('actions.scan')}
            </Button>
          </Stack>
          {message && (
            <Alert severity="warning" onClose={() => setMessage(undefined)}>
              {message}
            </Alert>
          )}
          {personId && pieces.length === 0 && mengeAusgaben.length === 0 && (
            <Typography color="text.secondary">{t('ruecknahme.empty')}</Typography>
          )}
          {[
            { key: 'person', title: t('ruecknahme.stuecke'), list: pieces },
            {
              key: 'unknown',
              title: t('ruecknahme.unknownPerson'),
              list: showUnknown ? unknownPersonPieces : [],
            },
          ].map(({ key, title, list }) =>
            list.length === 0 ? null : (
              <Stack key={key}>
                <Typography variant="subtitle2">{title}</Typography>
                {list.map((s) => (
                  <Stack key={s.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <FormControlLabel
                      control={
                        <Checkbox checked={checked.has(s.id!)} onChange={() => toggle(s.id!)} />
                      }
                      label={labelOf(s.id!)}
                    />
                    {s.eigentum === 'privat' && (
                      <Chip size="small" variant="outlined" label={t('eigentum.privat')} />
                    )}
                  </Stack>
                ))}
              </Stack>
            ),
          )}
          {mengeAusgaben.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">{t('ruecknahme.mengen')}</Typography>
              {mengeAusgaben.map((a) => (
                <Stack key={a.id} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ flexGrow: 1 }}>
                    {view.artikelById.get(a.artikelId)?.bezeichnung ?? a.artikelId} · {a.groesse}
                  </Typography>
                  <TextField
                    size="small"
                    type="number"
                    label={t('ruecknahme.mengeLabel', { max: a.menge })}
                    value={mengen[a.id ?? ''] ?? ''}
                    onChange={(e) =>
                      setMengen((prev) => ({ ...prev, [a.id ?? '']: e.target.value }))
                    }
                    slotProps={{ htmlInput: { min: 0, max: a.menge, step: 1 } }}
                    sx={{ width: 150 }}
                  />
                </Stack>
              ))}
            </Stack>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label={t('fields.ziel')}
              value={ziel}
              onChange={(e) => setZiel(e.target.value as 'lager' | 'ausgeschieden')}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="lager">{t('ruecknahme.zielLager')}</MenuItem>
              <MenuItem value="ausgeschieden">{t('ruecknahme.zielAusgeschieden')}</MenuItem>
            </TextField>
            <TextField
              type="date"
              label={t('fields.datum')}
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <TextField
            label={t('fields.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            multiline
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
        <OnlineOnly>
          <Button variant="contained" disabled={!canSubmit} onClick={submit}>
            {t('ruecknahme.submit')}
          </Button>
        </OnlineOnly>
      </DialogActions>
      <BekleidungScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onCode={handleCode}
      />
    </Dialog>
  );
}
