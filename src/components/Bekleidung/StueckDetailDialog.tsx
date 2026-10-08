'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { totalWaschgaenge, waschLimitState } from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { setStueckStatus } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import {
  buildStueckTimeline,
  isoDateToDate,
  stueckLabel,
  todayLocalDate,
  type BekleidungView,
} from './bekleidungUi';

type TargetStatus = 'ausgeschieden' | 'nicht_auffindbar' | 'lager';

const STATUS_ACTIONS: { status: TargetStatus; key: 'markLager' | 'markAusgeschieden' | 'markNichtAuffindbar' }[] = [
  { status: 'lager', key: 'markLager' },
  { status: 'ausgeschieden', key: 'markAusgeschieden' },
  { status: 'nicht_auffindbar', key: 'markNichtAuffindbar' },
];

/** Stammdaten, Waschzähler und Verlauf eines Stücks. */
export default function StueckDetailDialog({
  open,
  view,
  stueckId,
  onClose,
  onEdit,
}: {
  open: boolean;
  view: BekleidungView;
  stueckId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations('bekleidung');
  const format = useFormatter();
  const errorText = useBekleidungErrorText();
  const stueck = view.stueckById.get(stueckId);
  const [target, setTarget] = useState<TargetStatus>();
  const [datum, setDatum] = useState(todayLocalDate);
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const timeline = useMemo(
    () => buildStueckTimeline(stueckId, view.ausgaben, view.waeschen),
    [stueckId, view.ausgaben, view.waeschen],
  );

  if (!stueck) return null;
  const artikel = view.artikelById.get(stueck.artikelId);
  const date = (iso?: string) =>
    iso ? format.dateTime(isoDateToDate(iso), { dateStyle: 'medium' }) : t('detail.unknownDate');
  const personName = (id?: string) => (id && view.personById.get(id)?.name) || id || '';
  const total = totalWaschgaenge(stueck);
  const limit = waschLimitState(stueck, artikel);

  const applyStatus = async () => {
    if (!target) return;
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      setStueckStatus(view.groupId, stueckId, target, datum, bemerkung.trim() || undefined),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error));
      return;
    }
    setTarget(undefined);
    setBemerkung('');
  };

  const fields: [string, string | undefined][] = [
    [t('fields.kategorie'), artikel ? t(`kategorie.${artikel.kategorie}`) : undefined],
    [t('fields.hersteller'), artikel?.hersteller],
    [t('fields.tagNummer'), stueck.tagNummer],
    [t('fields.groesse'), stueck.groesse],
    [t('fields.charge'), stueck.charge],
    [t('fields.eigentum'), t(`eigentum.${stueck.eigentum}`)],
    [t('fields.status'), t(`status.${stueck.status}`)],
    [t('fields.person'), stueck.personId ? personName(stueck.personId) : undefined],
    [t('fields.ausgegebenAm'), stueck.ausgegebenAm ? date(stueck.ausgegebenAm) : undefined],
    [t('fields.lagerort'), stueck.lagerort],
    [t('fields.letzteWaesche'), stueck.letzteWaescheAm ? date(stueck.letzteWaescheAm) : undefined],
    [t('fields.bemerkung'), stueck.bemerkung],
  ];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{stueckLabel(stueck, view.artikelById)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box
            component="dl"
            sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5, m: 0 }}
          >
            {fields
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <Box key={label} sx={{ display: 'contents' }}>
                  <Typography component="dt" variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
          </Box>
          <Typography variant="body1" component="div">
            {stueck.waschgaengeAltbestand > 0
              ? t('detail.washCounterAlt', { total, alt: stueck.waschgaengeAltbestand })
              : t('detail.washCounter', { total })}
            {artikel?.maxWaschgaenge ? ` ${t('detail.washMax', { max: artikel.maxWaschgaenge })}` : ''}
            {limit !== 'ok' && (
              <Chip
                size="small"
                sx={{ ml: 1 }}
                color={limit === 'reached' ? 'error' : 'warning'}
                label={t(limit === 'reached' ? 'detail.limitReached' : 'detail.limitNear')}
              />
            )}
          </Typography>

          <Typography variant="subtitle2">{t('detail.timeline')}</Typography>
          {timeline.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('detail.timelineEmpty')}
            </Typography>
          ) : (
            <List dense disablePadding>
              {timeline.map((entry) =>
                entry.kind === 'ausgabe' ? (
                  <ListItem key={entry.key} disableGutters>
                    <ListItemText
                      primary={`${date(entry.date)} · ${t('detail.issuedTo', {
                        person: personName(entry.personId),
                      })}`}
                      secondary={[
                        entry.zurueckAm
                          ? t('detail.returned', { date: date(entry.zurueckAm) })
                          : t('detail.stillIssued'),
                        entry.bemerkung,
                      ]
                        .filter(Boolean)
                        .join(' — ')}
                    />
                  </ListItem>
                ) : (
                  <ListItem key={entry.key} disableGutters>
                    <ListItemText
                      primary={`${date(entry.date)} · ${t('detail.waesche', {
                        programm:
                          t(`programm.${entry.programm}`) +
                          (entry.programmText ? ` (${entry.programmText})` : ''),
                      })}`}
                    />
                  </ListItem>
                ),
              )}
            </List>
          )}

          {target && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2">
                  {t(`detail.${STATUS_ACTIONS.find((a) => a.status === target)!.key}`)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('detail.statusHint')}
                </Typography>
                <TextField
                  type="date"
                  size="small"
                  label={t('fields.datum')}
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label={t('fields.bemerkung')}
                  value={bemerkung}
                  onChange={(e) => setBemerkung(e.target.value)}
                />
                <Stack direction="row" spacing={1}>
                  <Button onClick={() => setTarget(undefined)}>{t('actions.cancel')}</Button>
                  <OnlineOnly>
                    <Button variant="contained" disabled={busy || !datum} onClick={applyStatus}>
                      {t('detail.confirm')}
                    </Button>
                  </OnlineOnly>
                </Stack>
              </Stack>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {STATUS_ACTIONS.filter((a) => a.status !== stueck.status).map((a) => (
          <OnlineOnly key={a.status}>
            <Button size="small" onClick={() => setTarget(a.status)}>
              {t(`detail.${a.key}`)}
            </Button>
          </OnlineOnly>
        ))}
        <OnlineOnly>
          <Button size="small" onClick={onEdit}>
            {t('actions.edit')}
          </Button>
        </OnlineOnly>
        <Button onClick={onClose}>{t('actions.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
