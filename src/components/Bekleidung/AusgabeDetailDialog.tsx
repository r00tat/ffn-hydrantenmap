'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import BemerkungEditor from './BemerkungEditor';
import { setAusgabeBemerkung } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import { isoDateToDate, mengeLabel, type BekleidungView } from './bekleidungUi';
import IssueActionPanel, { type IssueAction } from './IssueActionPanel';

/**
 * Eine Ausgabe eines Mengenartikels: Angaben, Bemerkung ergänzen und — solange
 * sie offen ist — zurücknehmen oder an eine andere Person weitergeben.
 */
export default function AusgabeDetailDialog({
  open,
  view,
  ausgabeId,
  onClose,
}: {
  open: boolean;
  view: BekleidungView;
  ausgabeId: string;
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const format = useFormatter();
  const errorText = useBekleidungErrorText();
  const [issueAction, setIssueAction] = useState<IssueAction>();
  const [error, setError] = useState<string>();
  const ausgabe = view.ausgaben.find((a) => a.id === ausgabeId);

  if (!ausgabe) return null;
  const isOpen = !ausgabe.zurueckAm;
  const date = (iso?: string) =>
    iso ? format.dateTime(isoDateToDate(iso), { dateStyle: 'medium' }) : t('detail.unknownDate');
  const artikel = view.artikelById.get(ausgabe.artikelId);

  const saveBemerkung = async (value: string) => {
    const outcome = await callAction(() => setAusgabeBemerkung(view.groupId, ausgabeId, value));
    return outcome.ok ? undefined : errorText(outcome.error);
  };

  const fields: [string, string | undefined][] = [
    [t('fields.person'), view.personById.get(ausgabe.personId)?.name ?? ausgabe.personId],
    [t('fields.menge'), String(ausgabe.menge)],
    [t('fields.charge'), ausgabe.charge],
    [t('fields.eigentum'), ausgabe.eigentum ? t(`eigentum.${ausgabe.eigentum}`) : undefined],
    [t('fields.ausgegebenAm'), date(ausgabe.ausgegebenAm)],
    [t('fields.zurueckAm'), ausgabe.zurueckAm ? date(ausgabe.zurueckAm) : undefined],
    [t('fields.artikelBemerkung'), artikel?.bemerkung],
  ];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mengeLabel(ausgabe, view.artikelById)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box
            component="dl"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 2,
              rowGap: 0.5,
              m: 0,
            }}
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
          <BemerkungEditor
            key={ausgabe.bemerkung ?? ''}
            value={ausgabe.bemerkung}
            onSave={saveBemerkung}
          />
          {issueAction && isOpen && (
            <IssueActionPanel
              view={view}
              action={issueAction}
              ausgabe={ausgabe}
              currentPersonId={ausgabe.personId}
              onCancel={() => setIssueAction(undefined)}
              onDone={onClose}
              onError={setError}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {isOpen &&
          !issueAction &&
          (['return', 'reassign'] as const).map((action) => (
            <OnlineOnly key={action}>
              <Button size="small" onClick={() => setIssueAction(action)}>
                {t(action === 'return' ? 'actions.zuruecknehmen' : 'issueAction.reassign')}
              </Button>
            </OnlineOnly>
          ))}
        <Button onClick={onClose}>{t('actions.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
