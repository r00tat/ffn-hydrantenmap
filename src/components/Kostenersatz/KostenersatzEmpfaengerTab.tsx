'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  formatPaymentMethod,
  KostenersatzEmailVersand,
  KostenersatzRecipient,
  PaymentMethod,
  SELECTABLE_PAYMENT_METHODS,
} from '../../common/kostenersatz';
import KostenersatzEmailHistory from './KostenersatzEmailHistory';

export interface KostenersatzEmpfaengerTabProps {
  recipient: KostenersatzRecipient;
  onChange: (recipient: KostenersatzRecipient) => void;
  /** Versandprotokoll der Berechnung, siehe `getEmailHistory`. */
  emailHistory?: KostenersatzEmailVersand[];
}

export default function KostenersatzEmpfaengerTab({
  recipient,
  onChange,
  emailHistory = [],
}: KostenersatzEmpfaengerTabProps) {
  const t = useTranslations('kostenersatz.empfaengerTab');

  // Eine ältere Berechnung kann noch eine SumUp-Verrechnungsart tragen; sie
  // bleibt sichtbar, ist aber nicht neu wählbar.
  const paymentMethods = SELECTABLE_PAYMENT_METHODS.includes(recipient.paymentMethod)
    ? SELECTABLE_PAYMENT_METHODS
    : [...SELECTABLE_PAYMENT_METHODS, recipient.paymentMethod];

  const handleFieldChange =
    (field: keyof KostenersatzRecipient) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({
        ...recipient,
        [field]: event.target.value,
      });
    };

  const handlePaymentMethodChange = (event: SelectChangeEvent<PaymentMethod>) => {
    onChange({
      ...recipient,
      paymentMethod: event.target.value as PaymentMethod,
    });
  };

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

      <FormControl fullWidth>
        <InputLabel id="payment-method-label">{t('paymentMethod')}</InputLabel>
        <Select
          labelId="payment-method-label"
          value={recipient.paymentMethod}
          label={t('paymentMethod')}
          onChange={handlePaymentMethodChange}
        >
          {paymentMethods.map((method) => (
            <MenuItem
              key={method}
              value={method}
              disabled={!SELECTABLE_PAYMENT_METHODS.includes(method)}
            >
              {formatPaymentMethod(method)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <KostenersatzEmailHistory entries={emailHistory} />
    </Box>
  );
}
