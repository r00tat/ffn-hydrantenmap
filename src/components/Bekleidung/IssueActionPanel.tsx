'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BekleidungAusgabe } from '../../common/bekleidung';
import { memberPersons } from '../../common/personal';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { reassignItems, returnItems } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import { todayLocalDate, type BekleidungView } from './bekleidungUi';

export type IssueAction = 'return' | 'reassign';

/**
 * Rücknahme oder Weitergabe einer einzelnen Ausgabe, eingebettet in den
 * Detaildialog: entweder ein Stück oder eine offene Mengen-Ausgabe. Bei einer
 * Menge lässt sich die Anzahl wählen, der Rest bleibt bei der Person.
 */
export default function IssueActionPanel({
  view,
  action,
  stueckId,
  ausgabe,
  currentPersonId,
  onCancel,
  onDone,
  onError,
}: {
  view: BekleidungView;
  action: IssueAction;
  stueckId?: string;
  /** Offene Mengen-Ausgabe; ohne `stueckId`. */
  ausgabe?: BekleidungAusgabe;
  currentPersonId?: string;
  onCancel: () => void;
  onDone: () => void;
  onError: (message: string | undefined) => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const persons = useMemo(
    () => memberPersons(view.persons).filter((p) => p.id !== currentPersonId),
    [view.persons, currentPersonId],
  );
  const [personId, setPersonId] = useState('');
  const [ziel, setZiel] = useState<'lager' | 'ausgeschieden'>('lager');
  const [menge, setMenge] = useState(String(ausgabe?.menge ?? 1));
  const [datum, setDatum] = useState(todayLocalDate);
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);

  const mengeNumber = Number(menge);
  const mengeValid =
    !ausgabe || (Number.isInteger(mengeNumber) && mengeNumber >= 1 && mengeNumber <= ausgabe.menge);
  const canSubmit = !!datum && mengeValid && (action === 'return' || !!personId) && !busy;

  const submit = async () => {
    setBusy(true);
    onError(undefined);
    const stueckIds = stueckId ? [stueckId] : [];
    const mengen = ausgabe?.id ? [{ ausgabeId: ausgabe.id, menge: mengeNumber }] : [];
    const note = bemerkung.trim() || undefined;
    const outcome = await callAction(() =>
      action === 'return'
        ? returnItems(view.groupId, { datum, bemerkung: note, ziel, stueckIds, mengen })
        : reassignItems(view.groupId, { personId, datum, bemerkung: note, stueckIds, mengen }),
    );
    setBusy(false);
    if (!outcome.ok) {
      onError(errorText(outcome.error));
      return;
    }
    onDone();
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2">
          {t(action === 'return' ? 'issueAction.returnTitle' : 'issueAction.reassignTitle')}
        </Typography>
        {action === 'reassign' ? (
          <Autocomplete
            options={persons}
            value={persons.find((p) => p.id === personId) ?? null}
            onChange={(_, value) => setPersonId(value?.id ?? '')}
            getOptionLabel={(p) => p.name}
            getOptionKey={(p) => p.id ?? p.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField {...params} size="small" label={t('issueAction.newPerson')} />
            )}
          />
        ) : (
          <TextField
            select
            size="small"
            label={t('fields.ziel')}
            value={ziel}
            onChange={(e) => setZiel(e.target.value as 'lager' | 'ausgeschieden')}
          >
            <MenuItem value="lager">{t('ruecknahme.zielLager')}</MenuItem>
            <MenuItem value="ausgeschieden">{t('ruecknahme.zielAusgeschieden')}</MenuItem>
          </TextField>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {ausgabe && ausgabe.menge > 1 && (
            <TextField
              type="number"
              size="small"
              label={t('issueAction.menge', { max: ausgabe.menge })}
              value={menge}
              onChange={(e) => setMenge(e.target.value)}
              error={!mengeValid}
              slotProps={{ htmlInput: { min: 1, max: ausgabe.menge, step: 1 } }}
            />
          )}
          <TextField
            type="date"
            size="small"
            label={t('fields.datum')}
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        <TextField
          size="small"
          label={t('fields.bemerkung')}
          value={bemerkung}
          onChange={(e) => setBemerkung(e.target.value)}
        />
        <Stack direction="row" spacing={1}>
          <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          <OnlineOnly>
            <Button variant="contained" disabled={!canSubmit} onClick={submit}>
              {t(action === 'return' ? 'ruecknahme.submit' : 'issueAction.reassignSubmit')}
            </Button>
          </OnlineOnly>
        </Stack>
      </Stack>
    </Paper>
  );
}
