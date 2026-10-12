'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BekleidungArtikel } from '../../common/bekleidung';
import { planConversionToMenge } from '../../common/bekleidungConvert';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { convertArtikelToMenge } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import type { BekleidungView } from './bekleidungUi';

/**
 * Einen Einzelartikel künftig als Menge führen. Die Vorschau rechnet mit
 * derselben Funktion wie die Server Action, damit die Zahlen stimmen.
 */
export default function ArtikelConvertDialog({
  open,
  view,
  artikel,
  onClose,
}: {
  open: boolean;
  view: BekleidungView;
  artikel: BekleidungArtikel;
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const plan = useMemo(
    () =>
      planConversionToMenge(
        view.stuecke.filter((s) => s.artikelId === artikel.id),
        view.ausgaben.filter((a) => a.artikelId === artikel.id),
      ),
    [view.stuecke, view.ausgaben, artikel.id],
  );
  const bestand = plan.bestand.reduce((sum, b) => sum + b.anzahl, 0);
  const dropped = plan.dropped.privat + plan.dropped.ausgeschieden + plan.dropped.ohnePerson;

  const submit = async () => {
    if (!artikel.id) return;
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() => convertArtikelToMenge(view.groupId, artikel.id!));
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('artikel.convertTitle', { name: artikel.bezeichnung })}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {plan.hasWaeschen && <Alert severity="error">{t('artikel.convertWaeschen')}</Alert>}
          <Typography variant="body2">{t('artikel.convertBestand', { count: bestand })}</Typography>
          <Typography variant="body2">
            {t('artikel.convertAusgaben', { count: plan.ausgaben.length })}
          </Typography>
          {dropped > 0 && (
            <Typography variant="body2">
              {t('artikel.convertDropped', { count: dropped })}
            </Typography>
          )}
          <Alert severity="warning">{t('artikel.convertHint')}</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
        <OnlineOnly>
          <Button
            variant="contained"
            color="warning"
            disabled={plan.hasWaeschen || busy}
            onClick={submit}
          >
            {t('artikel.convert')}
          </Button>
        </OnlineOnly>
      </DialogActions>
    </Dialog>
  );
}
