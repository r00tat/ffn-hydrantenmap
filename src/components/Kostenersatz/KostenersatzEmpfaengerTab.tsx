'use client';

import { useTranslations } from 'next-intl';
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
  /** Save the calculation before creating a SumUp payment. Returns the calculationId on success. */
  onSaveBeforePayment?: () => Promise<string | undefined>;
}

const PAYMENT_METHODS: PaymentMethod[] = ['bar', 'kreditkarte', 'rechnung', 'sumup_online', 'sumup_app'];

function PaymentStatusChip({ status }: { status: string }) {
  const t = useTranslations('kostenersatz.empfaengerTab');
  switch (status) {
    case 'pending':
      return <Chip color="warning" label={t('chipPending')} size="small" />;
    case 'paid':
      return <Chip color="success" label={t('chipPaid')} size="small" />;
    case 'failed':
      return <Chip color="error" label={t('chipFailed')} size="small" />;
    case 'expired':
      return <Chip color="error" label={t('chipExpired')} size="small" />;
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
  onSaveBeforePayment,
}: KostenersatzEmpfaengerTabProps) {
  const t = useTranslations('kostenersatz.empfaengerTab');
  const tCommon = useTranslations('common');
  const [loadingAction, setLoadingAction] = useState<'online' | 'app' | null>(null);
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

  const statusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
        return t('statusPending');
      case 'paid':
        return t('statusPaid');
      case 'failed':
        return t('statusFailed');
      case 'expired':
        return t('statusExpired');
      default:
        return status;
    }
  };

  const handleCheckStatus = async () => {
    if (!firecallId || !calculationId) return;
    setIsCheckingStatus(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await checkSumupPaymentStatus(firecallId, calculationId);
      if (result.success && result.status) {
        setStatusMessage(
          t('paymentStatus', { status: statusLabel(result.status) }),
        );
      } else if (!result.success) {
        setError(result.error || t('statusCheckError'));
      }
    } catch {
      setError(t('statusCheckErrorGeneric'));
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
    if (!firecallId) return;
    setLoadingAction('online');
    setError(null);
    try {
      // Set payment method to sumup_online before saving
      if (recipient.paymentMethod !== 'sumup_online') {
        onChange({ ...recipient, paymentMethod: 'sumup_online' });
      }
      let calcId = calculationId;
      if (!calcId && onSaveBeforePayment) {
        calcId = await onSaveBeforePayment();
        if (!calcId) {
          setError(t('paymentSaveError'));
          return;
        }
      }
      if (!calcId) return;
      const result = await createSumupCheckout(firecallId, calcId);
      if (result.success && result.checkoutUrl) {
        setCheckoutUrl(result.checkoutUrl);
        setShowPaymentDialog(true);
      } else {
        setError(result.error || t('paymentCreateError'));
      }
    } catch (err: any) {
      setError(err.message || t('paymentCreateError'));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopyLink = async () => {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setStatusMessage(t('linkCopied'));
    } catch {
      setError(t('linkCopyFailed'));
    }
  };

  const handleAppPayment = async () => {
    if (!firecallId) return;
    setLoadingAction('app');
    setError(null);
    try {
      // Set payment method to sumup_app before saving
      if (recipient.paymentMethod !== 'sumup_app') {
        onChange({ ...recipient, paymentMethod: 'sumup_app' });
      }
      let calcId = calculationId;
      if (!calcId && onSaveBeforePayment) {
        calcId = await onSaveBeforePayment();
        if (!calcId) {
          setError(t('paymentSaveError'));
          return;
        }
      }
      if (!calcId) return;
      const result = await getSumupDeepLink(firecallId, calcId);
      if (result.success && result.deepLinkUrl) {
        window.location.href = result.deepLinkUrl;
      } else {
        setError(result.error || t('deepLinkError'));
      }
    } catch (err: any) {
      setError(err.message || t('deepLinkError'));
    } finally {
      setLoadingAction(null);
    }
  };

  const sumupButtonDisabled = !firecallId || loadingAction !== null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {t('header')}
      </Typography>

      <TextField
        label={t('name')}
        value={recipient.name}
        onChange={handleFieldChange('name')}
        fullWidth
        required
        placeholder={t('namePlaceholder')}
      />

      <TextField
        label={t('address')}
        value={recipient.address}
        onChange={handleFieldChange('address')}
        fullWidth
        multiline
        rows={3}
        placeholder={t('addressPlaceholder')}
      />

      <TextField
        label={t('phone')}
        value={recipient.phone}
        onChange={handleFieldChange('phone')}
        fullWidth
        type="tel"
        placeholder={t('phonePlaceholder')}
      />

      <TextField
        label={t('email')}
        value={recipient.email}
        onChange={handleFieldChange('email')}
        fullWidth
        type="email"
        placeholder={t('emailPlaceholder')}
      />

      <FormControl fullWidth disabled={disabled}>
        <InputLabel id="payment-method-label">{t('paymentMethod')}</InputLabel>
        <Select
          labelId="payment-method-label"
          value={recipient.paymentMethod}
          label={t('paymentMethod')}
          onChange={handlePaymentMethodChange}
        >
          {PAYMENT_METHODS.map((method) => (
            <MenuItem key={method} value={method}>
              {formatPaymentMethod(method, method === recipient.paymentMethod ? sumupPaymentStatus : undefined)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={loadingAction === 'online' ? <CircularProgress size={20} /> : <PaymentIcon />}
          onClick={handleOnlinePayment}
          disabled={sumupButtonDisabled}
        >
          {t('createOnlinePayment')}
        </Button>
        {/* TODO: SumUp app deep link does not support NFC payments, disabled until resolved
        <Button
          variant="contained"
          startIcon={loadingAction === 'app' ? <CircularProgress size={20} /> : <PhoneAndroidIcon />}
          onClick={handleAppPayment}
          disabled={sumupButtonDisabled}
        >
          In SumUp App bezahlen
        </Button>
        */}
        {sumupPaymentStatus && (
          <>
            <PaymentStatusChip status={sumupPaymentStatus} />
            <Tooltip title={t('checkStatus')}>
              <span>
                <IconButton size="small" onClick={handleCheckStatus} disabled={isCheckingStatus}>
                  {isCheckingStatus ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Payment sharing dialog with QR code */}
      <Dialog
        open={showPaymentDialog}
        onClose={() => setShowPaymentDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('paymentLinkTitle')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              {t('paymentLinkScan')}
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
                {t('copyLink')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                onClick={() => { if (checkoutUrl) window.open(checkoutUrl, '_blank'); }}
                fullWidth
              >
                {t('openInBrowser')}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPaymentDialog(false)}>
            {tCommon('close')}
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

    </Box>
  );
}
