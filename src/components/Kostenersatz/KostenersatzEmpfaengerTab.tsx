'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  formatPaymentMethod,
  KostenersatzRecipient,
  PaymentMethod,
} from '../../common/kostenersatz';

export interface KostenersatzEmpfaengerTabProps {
  recipient: KostenersatzRecipient;
  onChange: (recipient: KostenersatzRecipient) => void;
  disabled?: boolean;
}

const PAYMENT_METHODS: PaymentMethod[] = ['bar', 'kreditkarte', 'rechnung'];

export default function KostenersatzEmpfaengerTab({
  recipient,
  onChange,
  disabled = false,
}: KostenersatzEmpfaengerTabProps) {
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
        Empfängerdaten für die Rechnung
      </Typography>

      <TextField
        label="Name"
        value={recipient.name}
        onChange={handleFieldChange('name')}
        fullWidth
        required
        disabled={disabled}
        placeholder="Vor- und Nachname oder Firmenname"
      />

      <TextField
        label="Adresse"
        value={recipient.address}
        onChange={handleFieldChange('address')}
        fullWidth
        multiline
        rows={3}
        disabled={disabled}
        placeholder="Straße, Hausnummer&#10;PLZ Ort"
      />

      <TextField
        label="Telefonnummer"
        value={recipient.phone}
        onChange={handleFieldChange('phone')}
        fullWidth
        disabled={disabled}
        type="tel"
        placeholder="+43 ..."
      />

      <TextField
        label="E-Mail"
        value={recipient.email}
        onChange={handleFieldChange('email')}
        fullWidth
        disabled={disabled}
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
              {formatPaymentMethod(method)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
