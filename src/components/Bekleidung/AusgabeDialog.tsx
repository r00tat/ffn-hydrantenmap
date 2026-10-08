'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import type { BekleidungStueck } from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { issue, returnItems } from './bekleidungActions';
import { parseBekleidungError, useBekleidungErrorText } from './bekleidungErrors';
import { stueckLabel, todayLocalDate, type BekleidungView } from './bekleidungUi';
import MengeLinesEditor, { completeMengeLines, type MengeLineDraft } from './MengeLinesEditor';
import StueckCollector from './StueckCollector';

export interface AusgabeDialogProps {
  open: boolean;
  view: BekleidungView;
  initialPersonId?: string;
  onClose: () => void;
}

const offerLager = (s: BekleidungStueck) => s.status === 'lager';
// Ein noch ausgegebenes Stück darf per Scan dazu: Der Server lehnt es ab und
// der Dialog bietet „zurücknehmen und neu ausgeben" an.
const acceptScanned = (s: BekleidungStueck) => s.status === 'lager' || s.status === 'ausgegeben';

/**
 * Ausgabe an eine Person: Stücke und Mengenartikel sammeln und auf einmal
 * buchen. Das Datum ist heute, rückdatierbar.
 */
export default function AusgabeDialog({ open, view, initialPersonId, onClose }: AusgabeDialogProps) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const activePersons = useMemo(
    () => view.persons.filter((p) => p.active !== false),
    [view.persons],
  );
  const [personId, setPersonId] = useState(initialPersonId ?? '');
  const [datum, setDatum] = useState(todayLocalDate);
  const [stueckIds, setStueckIds] = useState<string[]>([]);
  const [lines, setLines] = useState<MengeLineDraft[]>([]);
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [conflictId, setConflictId] = useState<string>();

  const labelOf = useCallback(
    (id: string) => {
      const s = view.stueckById.get(id);
      return s ? stueckLabel(s, view.artikelById) : id;
    },
    [view],
  );
  const personName = (id?: string) =>
    (id && view.personById.get(id)?.name) || t('ausgabe.unknownPerson');
  const errorCtx = {
    stueckLabel: labelOf,
    artikelLabel: (id: string) => view.artikelById.get(id)?.bezeichnung ?? id,
  };

  const mengen = completeMengeLines(lines);
  const canSubmit = !!personId && !!datum && (stueckIds.length > 0 || mengen.length > 0) && !busy;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    setConflictId(undefined);
    const outcome = await callAction(() =>
      issue(view.groupId, {
        personId,
        datum,
        bemerkung: bemerkung.trim() || undefined,
        stueckIds,
        mengen,
      }),
    );
    setBusy(false);
    if (outcome.ok) {
      onClose();
      return;
    }
    const parsed = parseBekleidungError(outcome.error);
    if (parsed.code === 'alreadyIssued') setConflictId(parsed.stueckId);
    setError(errorText(outcome.error, errorCtx));
  };

  const reissue = async () => {
    if (!conflictId) return;
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      returnItems(view.groupId, { datum, ziel: 'lager', stueckIds: [conflictId], mengen: [] }),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error, errorCtx));
      return;
    }
    await submit();
  };

  const conflict = conflictId ? view.stueckById.get(conflictId) : undefined;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('ausgabe.title')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && !conflictId && <Alert severity="error">{error}</Alert>}
          {conflictId && (
            <Alert
              severity="warning"
              action={
                <OnlineOnly>
                  <Button color="inherit" size="small" disabled={busy} onClick={reissue}>
                    {t('ausgabe.reissue')}
                  </Button>
                </OnlineOnly>
              }
            >
              {t('ausgabe.alreadyIssuedHint', {
                stueck: labelOf(conflictId),
                person: personName(conflict?.personId),
              })}
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete
              options={activePersons}
              value={activePersons.find((p) => p.id === personId) ?? null}
              onChange={(_, value) => setPersonId(value?.id ?? '')}
              getOptionLabel={(p) => p.name}
              getOptionKey={(p) => p.id ?? p.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label={t('fields.person')} />}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              type="date"
              label={t('fields.datum')}
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <StueckCollector
            view={view}
            label={t('ausgabe.stuecke')}
            selectedIds={stueckIds}
            onChange={setStueckIds}
            offer={offerLager}
            accept={acceptScanned}
            renderExtra={(s) =>
              s.status === 'ausgegeben' ? (
                <Chip
                  size="small"
                  color="warning"
                  label={t('ausgabe.stillIssuedChip', { person: personName(s.personId) })}
                />
              ) : null
            }
          />
          <MengeLinesEditor view={view} lines={lines} onChange={setLines} />
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
            {t('ausgabe.submit')}
          </Button>
        </OnlineOnly>
      </DialogActions>
    </Dialog>
  );
}
