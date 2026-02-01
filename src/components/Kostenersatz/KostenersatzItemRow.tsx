'use client';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useState } from 'react';
import {
  formatCurrency,
  KostenersatzLineItem,
  KostenersatzRate,
} from '../../common/kostenersatz';

export interface KostenersatzItemRowProps {
  rate: KostenersatzRate;
  item?: KostenersatzLineItem;
  defaultStunden: number;
  onItemChange: (
    rateId: string,
    einheiten: number,
    stunden: number,
    stundenOverridden: boolean
  ) => void;
  disabled?: boolean;
}

export default function KostenersatzItemRow({
  rate,
  item,
  defaultStunden,
  onItemChange,
  disabled = false,
}: KostenersatzItemRowProps) {
  const einheiten = item?.einheiten || 0;
  const stunden = item?.anzahlStunden || defaultStunden;
  const stundenOverridden = item?.stundenOverridden || false;
  const sum = item?.sum || 0;

  const [localEinheiten, setLocalEinheiten] = useState<string>(
    einheiten > 0 ? String(einheiten) : ''
  );
  const [localStunden, setLocalStunden] = useState<string>(String(stunden));

  const hasValue = einheiten > 0;

  const handleEinheitenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalEinheiten(value);

    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      onItemChange(
        rate.id,
        numValue,
        stundenOverridden ? stunden : defaultStunden,
        stundenOverridden
      );
    } else if (value === '') {
      onItemChange(rate.id, 0, defaultStunden, false);
    }
  };

  const handleStundenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalStunden(value);

    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      onItemChange(rate.id, einheiten, numValue, numValue !== defaultStunden);
    }
  };

  const handleToggleStundenOverride = () => {
    if (stundenOverridden) {
      // Reset to default
      setLocalStunden(String(defaultStunden));
      onItemChange(rate.id, einheiten, defaultStunden, false);
    } else {
      // Enable override (keep current value)
      onItemChange(rate.id, einheiten, stunden, true);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 1,
        px: 1,
        backgroundColor: hasValue ? 'action.selected' : 'transparent',
        borderRadius: 1,
        '&:hover': {
          backgroundColor: hasValue ? 'action.selected' : 'action.hover',
        },
      }}
    >
      {/* Description */}
      <Box sx={{ flex: 2, minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          title={rate.description}
          sx={{ fontWeight: hasValue ? 500 : 400 }}
        >
          {rate.id} {rate.description}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {rate.unit} • {formatCurrency(rate.price)}/h
          {rate.pricePauschal && ` • ${formatCurrency(rate.pricePauschal)} pauschal`}
        </Typography>
      </Box>

      {/* Einheiten input */}
      <TextField
        size="small"
        type="number"
        value={localEinheiten}
        onChange={handleEinheitenChange}
        placeholder="0"
        disabled={disabled}
        inputProps={{ min: 0, style: { textAlign: 'right' } }}
        sx={{ width: 80 }}
      />

      {/* Stunden input with lock toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TextField
          size="small"
          type="number"
          value={localStunden}
          onChange={handleStundenChange}
          disabled={disabled || !hasValue}
          inputProps={{ min: 1, style: { textAlign: 'right' } }}
          sx={{
            width: 60,
            '& input': {
              color: stundenOverridden ? 'warning.main' : 'inherit',
            },
          }}
        />
        <Tooltip
          title={
            stundenOverridden
              ? 'Individuelle Stunden - Klicken zum Zurücksetzen'
              : 'Standard-Stunden verwenden - Klicken für individuelle Stunden'
          }
        >
          <span>
            <IconButton
              size="small"
              onClick={handleToggleStundenOverride}
              disabled={disabled || !hasValue}
              color={stundenOverridden ? 'warning' : 'default'}
            >
              {stundenOverridden ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Sum */}
      <Typography
        variant="body2"
        sx={{
          width: 100,
          textAlign: 'right',
          fontWeight: hasValue ? 600 : 400,
          color: hasValue ? 'text.primary' : 'text.secondary',
        }}
      >
        {formatCurrency(sum)}
      </Typography>
    </Box>
  );
}
