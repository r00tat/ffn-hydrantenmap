'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { rechnungStatusFarbe } from '../../common/atemschutzRechnung';
import { KOSTENERSATZ_GROUP, formatCurrency } from '../../common/kostenersatz';
import useAtemschutzEmpfaenger from '../../hooks/useAtemschutzEmpfaenger';
import useAtemschutzRechnungen from '../../hooks/useAtemschutzRechnungen';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { downloadBlob } from '../firebase/download';
import { fehlerText } from './rechnungFehler';
import RechnungEditDialog from './RechnungEditDialog';
import RechnungMailDialog from './RechnungMailDialog';
import {
  cancelFuellungRechnung,
  renderFuellungRechnungPdf,
  setFuellungRechnungBezahlt,
} from './rechnungActions';

const STATUS_LABEL = {
  draft: 'rechnung.status.draft',
  sent: 'rechnung.status.sent',
  paid: 'rechnung.status.paid',
  cancelled: 'rechnung.status.cancelled',
} as const;

export interface RechnungPageProps {
  rechnungId: string;
}

export default function RechnungPage({ rechnungId }: RechnungPageProps) {
  const t = useTranslations('atemschutz');
  const format = useFormatter();
  const { isAuthorized, groups: freigaben } = useFirebaseLogin();
  const { groupId } = useFahrtenbuchGroup();

  // Kein eigener Dokument-Hook: Die Liste ist auf dieser Seite ohnehin
  // abonniert, und ein zweites Abonnement auf dasselbe Dokument brächte nur
  // eine weitere Fehlerquelle beim Rechteentzug.
  const rechnungen = useAtemschutzRechnungen(groupId);
  const empfaenger = useAtemschutzEmpfaenger(groupId);
  const rechnung = useMemo(
    () => rechnungen.find((r) => r.id === rechnungId),
    [rechnungen, rechnungId],
  );

  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState(false);
  const [mailOffen, setMailOffen] = useState(false);
  const [stornoOffen, setStornoOffen] = useState(false);
  const [editOffen, setEditOffen] = useState(false);

  if (!isAuthorized || !freigaben?.includes(KOSTENERSATZ_GROUP)) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('rechnung.noPermission')}</Typography>
      </Container>
    );
  }

  if (!rechnung || !groupId) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('rechnung.nichtGefunden')}</Typography>
      </Container>
    );
  }

  const handlePdf = async () => {
    setLaeuft(true);
    setFehler(undefined);
    const result = await renderFuellungRechnungPdf({ groupId, rechnungId });
    setLaeuft(false);
    if (result.success && result.pdfBase64 && result.fileName) {
      const bytes = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0));
      await downloadBlob(new Blob([bytes], { type: 'application/pdf' }), result.fileName);
      return;
    }
    setFehler(result.error ?? 'saveFailed');
  };

  const handleBezahlt = async () => {
    setLaeuft(true);
    setFehler(undefined);
    const result = await setFuellungRechnungBezahlt({ groupId, rechnungId });
    setLaeuft(false);
    if (!result.success) setFehler(result.error ?? 'saveFailed');
  };

  const handleStorno = async () => {
    setStornoOffen(false);
    setLaeuft(true);
    setFehler(undefined);
    const result = await cancelFuellungRechnung({ groupId, rechnungId });
    setLaeuft(false);
    if (!result.success) setFehler(result.error ?? 'saveFailed');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Button
        component={Link}
        href="/atemschutz/verrechnung"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 1 }}
      >
        {t('rechnung.zurueckZurListe')}
      </Button>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4">{rechnung.nummer}</Typography>
        <Chip
          color={rechnungStatusFarbe(rechnung.status)}
          label={t(STATUS_LABEL[rechnung.status])}
        />
      </Stack>

      {fehler && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {fehlerText(t, fehler)}
        </Alert>
      )}

      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="subtitle1">{rechnung.empfaenger.name}</Typography>
        {!!rechnung.empfaenger.ansprechpartner && (
          <Typography variant="body2">{rechnung.empfaenger.ansprechpartner}</Typography>
        )}
        <Typography variant="body2">{rechnung.empfaenger.adresse}</Typography>
        <Typography variant="body2">{rechnung.empfaenger.email}</Typography>
      </Stack>

      <Typography variant="body2" sx={{ mb: 2 }}>
        {t('rechnung.spalteDatum')}:{' '}
        {format.dateTime(new Date(rechnung.datum), { dateStyle: 'short' })} ·{' '}
        {t('rechnung.spalteZeitraum')}:{' '}
        {format.dateTime(new Date(rechnung.zeitraumVon), {
          dateStyle: 'short',
        })}{' '}
        –{' '}
        {format.dateTime(new Date(rechnung.zeitraumBis), {
          dateStyle: 'short',
        })}
      </Typography>

      <Table size="small" sx={{ mb: 2 }}>
        <TableHead>
          <TableRow>
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
          {rechnung.positionen.map((position) => (
            <TableRow key={position.fuellungId}>
              <TableCell>
                {format.dateTime(new Date(position.zeitpunkt), {
                  dateStyle: 'short',
                })}
              </TableCell>
              <TableCell>
                {position.flaschenNummer ?? '—'}
                {position.volumenLiter ? ` (${position.volumenLiter} l)` : ''}
              </TableCell>
              <TableCell>{position.firecallName ?? ''}</TableCell>
              <TableCell align="right">{position.anzahl}</TableCell>
              <TableCell>{position.rateId}</TableCell>
              <TableCell align="right">{formatCurrency(position.einzelpreis)}</TableCell>
              <TableCell align="right">{formatCurrency(position.summe)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Typography variant="h6" sx={{ textAlign: 'right', mb: 3 }}>
        {t('rechnung.summe')}: {formatCurrency(rechnung.summe)}
      </Typography>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={handlePdf} disabled={laeuft}>
          {t('rechnung.pdf')}
        </Button>
        {rechnung.status === 'draft' && (
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => setEditOffen(true)}
            disabled={laeuft}
          >
            {t('rechnung.bearbeiten')}
          </Button>
        )}
        {rechnung.status === 'draft' && (
          <Button variant="contained" onClick={() => setMailOffen(true)} disabled={laeuft}>
            {t('rechnung.send')}
          </Button>
        )}
        {rechnung.status === 'sent' && (
          <Button variant="contained" onClick={handleBezahlt} disabled={laeuft}>
            {t('rechnung.bezahlt')}
          </Button>
        )}
        {rechnung.status !== 'cancelled' && (
          <Button color="error" onClick={() => setStornoOffen(true)} disabled={laeuft}>
            {t('rechnung.storno')}
          </Button>
        )}
      </Stack>

      {editOffen && (
        <RechnungEditDialog
          open
          groupId={groupId}
          rechnung={rechnung}
          empfaenger={empfaenger}
          onClose={() => setEditOffen(false)}
          onSaved={() => setEditOffen(false)}
        />
      )}

      {mailOffen && (
        <RechnungMailDialog
          open
          groupId={groupId}
          rechnungId={rechnungId}
          onClose={() => setMailOffen(false)}
          onSent={() => setMailOffen(false)}
        />
      )}

      <Dialog open={stornoOffen} onClose={() => setStornoOffen(false)}>
        <DialogTitle>{t('rechnung.storno')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('rechnung.stornoConfirm')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStornoOffen(false)}>{t('rechnung.cancel')}</Button>
          <Button color="error" onClick={handleStorno}>
            {t('rechnung.storno')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
