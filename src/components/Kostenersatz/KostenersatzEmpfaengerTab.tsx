'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PaymentIcon from '@mui/icons-material/Payment';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import QrCodeIcon from '@mui/icons-material/QrCode';
import RefreshIcon from '@mui/icons-material/Refresh';
import { QRCodeSVG } from 'qrcode.react';
import {
  formatPaymentMethod,
  KostenersatzRecipient,
  PaymentMethod,
} from '../../common/kostenersatz';
import { createSumupCheckout, getSumupDeepLink, checkSumupPaymentStatus } from './sumupActions';

export interface KostenersatzEmpfaengerTabProps {
  recipient: KostenersatzRecipient;
  onChange: (recipient: KostenersatzRecipient) => void;
  disabled?: boolean;
  firecallId?: string;
  calculationId?: string;
  sumupPaymentStatus?: string;
}

const PAYMENT_METHODS: PaymentMethod[] = ['bar', 'kreditkarte', 'rechnung', 'sumup_online', 'sumup_app'];

function PaymentStatusChip({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Chip color="warning" label="Zahlung ausstehend" size="small" />;
    case 'paid':
      return <Chip color="success" label="Bezahlt" size="small" />;
    case 'failed':
      return <Chip color="error" label="Zahlung fehlgeschlagen" size="small" />;
    case 'expired':
      return <Chip color="error" label="Zahlung abgelaufen" size="small" />;
    default:
      return null;
  }
}

export default function KostenersatzEmpfaengerTab({
  recipient,
  onChange,
  disabled = false,
  firecallId,
  calculationId,
  sumupPaymentStatus,
}: KostenersatzEmpfaengerTabProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Auto-check payment status when there's a pending payment
  useEffect(() => {
    if (sumupPaymentStatus === 'pending' && firecallId && calculationId) {
      setIsCheckingStatus(true);
      checkSumupPaymentStatus(firecallId, calculationId)
        .catch(() => {})
        .finally(() => setIsCheckingStatus(false));
    }
  }, [sumupPaymentStatus, firecallId, calculationId]);

  const statusLabels: Record<string, string> = {
    pending: 'ausstehend',
    paid: 'bezahlt',
    failed: 'fehlgeschlagen',
    expired: 'abgelaufen',
  };

  const handleCheckStatus = async () => {
    if (!firecallId || !calculationId) return;
    setIsCheckingStatus(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await checkSumupPaymentStatus(firecallId, calculationId);
      if (result.success && result.status) {
        const label = statusLabels[result.status] || result.status;
        setStatusMessage(`Zahlungsstatus: ${label}`);
      } else if (!result.success) {
        setError(result.error || 'Fehler beim Prüfen des Status');
      }
    } catch {
      setError('Fehler beim Prüfen des Zahlungsstatus');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleFieldChange =
    (field: keyof KostenersatzRecipient) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({
        ...recipient,
        [field]: event.target.value,
      });
    };

  const handlePaymentMethodChange = (event: SelectChangeEvent<PaymentMethod>) => {
    setError(null);
    onChange({
      ...recipient,
      paymentMethod: event.target.value as PaymentMethod,
    });
  };

  const handleOnlinePayment = async () => {
    if (!firecallId || !calculationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await createSumupCheckout(firecallId, calculationId);
      if (result.success && result.checkoutUrl) {
        setCheckoutUrl(result.checkoutUrl);
        setShowPaymentDialog(true);
      } else {
        setError(result.error || 'Fehler beim Erstellen der Zahlung');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen der Zahlung');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setStatusMessage('Link kopiert');
    } catch {
      setError('Link konnte nicht kopiert werden');
    }
  };

  const handleAppPayment = async () => {
    if (!firecallId || !calculationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getSumupDeepLink(firecallId, calculationId);
      if (result.success && result.deepLinkUrl) {
        window.location.href = result.deepLinkUrl;
      } else {
        setError(result.error || 'Fehler beim Erstellen des Deep Links');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen des Deep Links');
    } finally {
      setIsLoading(false);
    }
  };

  const isSumupMethod = recipient.paymentMethod === 'sumup_online' || recipient.paymentMethod === 'sumup_app';
  const sumupButtonDisabled = !firecallId || !calculationId || isLoading;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        Empf&auml;ngerdaten f&uuml;r die Rechnung
      </Typography>

      <TextField
        label="Name"
        value={recipient.name}
        onChange={handleFieldChange('name')}
        fullWidth
        required
        placeholder="Vor- und Nachname oder Firmenname"
      />

      <TextField
        label="Adresse"
        value={recipient.address}
        onChange={handleFieldChange('address')}
        fullWidth
        multiline
        rows={3}
        placeholder="Stra&szlig;e, Hausnummer&#10;PLZ Ort"
      />

      <TextField
        label="Telefonnummer"
        value={recipient.phone}
        onChange={handleFieldChange('phone')}
        fullWidth
        type="tel"
        placeholder="+43 ..."
      />

      <TextField
        label="E-Mail"
        value={recipient.email}
        onChange={handleFieldChange('email')}
        fullWidth
        type="email"
        placeholder="email@example.com"
      />

      <FormControl fullWidth disabled={disabled}>
        <InputLabel id="payment-method-label">Bezahlung via</InputLabel>
        <Select
          labelId="payment-method-label"
          value={recipient.paymentMethod}
          label="Bezahlung via"
          onChange={handlePaymentMethodChange}
        >
          {PAYMENT_METHODS.map((method) => (
            <MenuItem key={method} value={method}>
              {formatPaymentMethod(method, method === recipient.paymentMethod ? sumupPaymentStatus : undefined)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {recipient.paymentMethod === 'sumup_online' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={isLoading ? <CircularProgress size={20} /> : <PaymentIcon />}
            onClick={handleOnlinePayment}
            disabled={sumupButtonDisabled}
          >
            Zahlung erstellen
          </Button>
          {sumupPaymentStatus && (
            <>
              <PaymentStatusChip status={sumupPaymentStatus} />
              <Tooltip title="Status prüfen">
                <IconButton size="small" onClick={handleCheckStatus} disabled={isCheckingStatus}>
                  {isCheckingStatus ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      )}

      {recipient.paymentMethod === 'sumup_app' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={isLoading ? <CircularProgress size={20} /> : <PhoneAndroidIcon />}
            onClick={handleAppPayment}
            disabled={sumupButtonDisabled}
          >
            In SumUp App bezahlen
          </Button>
          {sumupPaymentStatus && (
            <>
              <PaymentStatusChip status={sumupPaymentStatus} />
              <Tooltip title="Status prüfen">
                <IconButton size="small" onClick={handleCheckStatus} disabled={isCheckingStatus}>
                  {isCheckingStatus ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      )}

      {/* Payment sharing dialog with QR code */}
      <Dialog
        open={showPaymentDialog}
        onClose={() => setShowPaymentDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Zahlungslink</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 1 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              QR-Code scannen oder Link teilen, um die Zahlung durchzuf&uuml;hren
            </Typography>
            {checkoutUrl && (
              <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 1 }}>
                <QRCodeSVG value={checkoutUrl} size={220} />
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyLink}
                fullWidth
              >
                Link kopieren
              </Button>
              <Button
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                onClick={() => { if (checkoutUrl) window.open(checkoutUrl, '_blank'); }}
                fullWidth
              >
                Im Browser &ouml;ffnen
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPaymentDialog(false)}>
            Schlie&szlig;en
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!statusMessage}
        autoHideDuration={4000}
        onClose={() => setStatusMessage(null)}
        message={statusMessage}
      />

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isSumupMethod && !firecallId && (
        <Alert severity="info">
          Berechnung muss zuerst gespeichert werden, bevor eine Zahlung erstellt werden kann.
        </Alert>
      )}
    </Box>
  );
}
