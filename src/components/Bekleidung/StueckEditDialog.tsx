'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BekleidungEigentum, BekleidungStueck } from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { createStuecke, updateStueck } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import type { BekleidungView } from './bekleidungUi';

const MAX_ANZAHL = 100;

/**
 * Stück anlegen oder bearbeiten. Beim Anlegen lassen sich über „Anzahl"
 * mehrere gleiche Stücke ohne Tag-Nummer anlegen — eine Tag-Nummer gehört
 * immer zu genau einem Stück.
 */
export default function StueckEditDialog({
  open,
  view,
  stueck,
  onClose,
}: {
  open: boolean;
  view: BekleidungView;
  /** Ohne Stück: anlegen. */
  stueck?: BekleidungStueck;
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const isNew = !stueck;
  const einzelArtikel = useMemo(
    () => view.artikel.filter((a) => a.fuehrung === 'einzeln' && (a.aktiv || a.id === stueck?.artikelId)),
    [view.artikel, stueck?.artikelId],
  );
  const [artikelId, setArtikelId] = useState(stueck?.artikelId ?? einzelArtikel[0]?.id ?? '');
  const [groesse, setGroesse] = useState(stueck?.groesse ?? '');
  const [charge, setCharge] = useState(stueck?.charge ?? '');
  const [tagNummer, setTagNummer] = useState(stueck?.tagNummer ?? '');
  const [eigentum, setEigentum] = useState<BekleidungEigentum>(stueck?.eigentum ?? 'feuerwehr');
  const [lagerort, setLagerort] = useState(stueck?.lagerort ?? '');
  const [bemerkung, setBemerkung] = useState(stueck?.bemerkung ?? '');
  const [anzahl, setAnzahl] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const anzahlNumber = Number(anzahl);
  const anzahlValid =
    !isNew || (Number.isInteger(anzahlNumber) && anzahlNumber >= 1 && anzahlNumber <= MAX_ANZAHL);
  const tagDisabled = isNew && anzahlNumber > 1;
  const canSubmit = !!artikelId && !!groesse.trim() && anzahlValid && !busy;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const fields = {
      groesse: groesse.trim(),
      charge: charge.trim() || undefined,
      tagNummer: tagDisabled ? undefined : tagNummer.trim() || undefined,
      eigentum,
      lagerort: lagerort.trim() || undefined,
      bemerkung: bemerkung.trim() || undefined,
    };
    const stueckId = stueck?.id;
    const outcome = stueckId
      ? await callAction(() => updateStueck(view.groupId, stueckId, fields))
      : await callAction(() =>
          createStuecke(view.groupId, { ...fields, artikelId, anzahl: anzahlNumber }),
        );
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t(isNew ? 'edit.titleNew' : 'edit.titleEdit')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {isNew && einzelArtikel.length === 0 && (
            <Alert severity="info">{t('edit.noArtikel')}</Alert>
          )}
          <TextField
            select
            label={t('fields.artikel')}
            value={artikelId}
            disabled={!isNew}
            onChange={(e) => setArtikelId(e.target.value)}
          >
            {einzelArtikel.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.bezeichnung}
                {a.hersteller ? ` (${a.hersteller})` : ''}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              required
              label={t('fields.groesse')}
              value={groesse}
              onChange={(e) => setGroesse(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              label={t('fields.charge')}
              value={charge}
              onChange={(e) => setCharge(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {isNew && (
              <TextField
                type="number"
                label={t('fields.anzahl')}
                value={anzahl}
                onChange={(e) => setAnzahl(e.target.value)}
                error={!anzahlValid}
                helperText={t('edit.anzahlHelper')}
                slotProps={{ htmlInput: { min: 1, max: MAX_ANZAHL, step: 1 } }}
                sx={{ width: { sm: 200 } }}
              />
            )}
            <TextField
              label={t('fields.tagNummer')}
              value={tagDisabled ? '' : tagNummer}
              disabled={tagDisabled}
              helperText={tagDisabled ? t('edit.tagDisabled') : undefined}
              onChange={(e) => setTagNummer(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label={t('fields.eigentum')}
              value={eigentum}
              onChange={(e) => setEigentum(e.target.value as BekleidungEigentum)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="feuerwehr">{t('eigentum.feuerwehr')}</MenuItem>
              <MenuItem value="privat">{t('eigentum.privat')}</MenuItem>
            </TextField>
            <TextField
              label={t('fields.lagerort')}
              value={lagerort}
              onChange={(e) => setLagerort(e.target.value)}
              sx={{ flexGrow: 1 }}
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
            {t('actions.save')}
          </Button>
        </OnlineOnly>
      </DialogActions>
    </Dialog>
  );
}
