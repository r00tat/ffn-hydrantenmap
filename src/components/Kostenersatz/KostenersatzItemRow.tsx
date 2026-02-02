'use client';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
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

/**
 * Check if a rate uses hourly pricing (with optional pauschal) vs per-unit pricing
 * Hourly rates have pricePauschal and their unit contains "Std" or "h"
 * Per-unit rates (like "pro Stück", "pro Sack") don't use hours in calculation
 */
function isHourlyRate(rate: KostenersatzRate): boolean {
  // If it has pricePauschal and hourly rate, it's an hourly rate
  if (rate.pricePauschal && rate.price > 0) {
    return true;
  }
  // Check unit for hourly indicators
  const hourlyUnits = ['je Std', 'pro Person & h', '/h'];
  return hourlyUnits.some((u) => rate.unit.includes(u));
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
  const showHours = isHourlyRate(rate);

  const handleEinheitenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalEinheiten(value);

    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      // For per-unit items, always use 1 hour (the calculation ignores hours anyway)
      const effectiveStunden = showHours
        ? stundenOverridden
          ? stunden
          : defaultStunden
        : 1;
      onItemChange(rate.id, numValue, effectiveStunden, showHours && stundenOverridden);
    } else if (value === '') {
      onItemChange(rate.id, 0, defaultStunden, false);
    }
  };

  const handleEinheitenIncrement = () => {
    const newValue = einheiten + 1;
    setLocalEinheiten(String(newValue));
    const effectiveStunden = showHours
      ? stundenOverridden
        ? stunden
        : defaultStunden
      : 1;
    onItemChange(rate.id, newValue, effectiveStunden, showHours && stundenOverridden);
  };

  const handleEinheitenDecrement = () => {
    if (einheiten <= 0) return;
    const newValue = einheiten - 1;
    setLocalEinheiten(newValue > 0 ? String(newValue) : '');
    if (newValue === 0) {
      onItemChange(rate.id, 0, defaultStunden, false);
    } else {
      const effectiveStunden = showHours
        ? stundenOverridden
          ? stunden
          : defaultStunden
        : 1;
      onItemChange(rate.id, newValue, effectiveStunden, showHours && stundenOverridden);
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

  // Format price display based on whether it's hourly or per-unit
  const priceDisplay = showHours
    ? `${formatCurrency(rate.price)}/h${rate.pricePauschal ? ` • ${formatCurrency(rate.pricePauschal)} pauschal` : ''}`
    : rate.price > 0
      ? formatCurrency(rate.price)
      : 'nach Aufwand';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
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
          sx={{ fontWeight: hasValue ? 500 : 400 }}
        >
          {rate.id} {rate.description}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {rate.unit} • {priceDisplay}
        </Typography>
      </Box>

      {/* Input row - stacks inputs horizontally even on mobile */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, justifyContent: { xs: 'flex-end', sm: 'flex-end' }, flexWrap: 'nowrap' }}>
        {/* Einheiten/Anzahl input with +/- buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mr: 0.5 }}>
            Anz:
          </Typography>
          <IconButton
            size="small"
            onClick={handleEinheitenDecrement}
            disabled={disabled || einheiten <= 0}
            sx={{ p: 0.5 }}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
          <TextField
            size="small"
            type="number"
            value={localEinheiten}
            onChange={handleEinheitenChange}
            placeholder="0"
            disabled={disabled}
            inputProps={{ min: 0, style: { textAlign: 'center' } }}
            sx={{ width: { xs: 45, sm: 55 }, '& input': { px: 0.5 } }}
          />
          <IconButton
            size="small"
            onClick={handleEinheitenIncrement}
            disabled={disabled}
            sx={{ p: 0.5 }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Stunden input with lock toggle - only for hourly rates */}
        {showHours ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
              h:
            </Typography>
            <TextField
              size="small"
              type="number"
              value={localStunden}
              onChange={handleStundenChange}
              disabled={disabled || !hasValue}
              inputProps={{ min: 1, style: { textAlign: 'right' } }}
              sx={{
                width: { xs: 45, sm: 55 },
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
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
                <IconButton
                  size="small"
                  onClick={handleToggleStundenOverride}
                  disabled={disabled || !hasValue}
                  color={stundenOverridden ? 'warning' : 'default'}
                >
                  {stundenOverridden ? (
                    <LockOpenIcon fontSize="small" />
                  ) : (
                    <LockIcon fontSize="small" />
                  )}
                </IconButton>
              </Box>
            </Tooltip>
          </Box>
        ) : (
          // Placeholder for alignment when hours not shown - hidden on mobile
          <Box sx={{ width: 90, display: { xs: 'none', sm: 'block' } }} />
        )}

        {/* Sum - always visible with flexShrink: 0 */}
        <Typography
          variant="body2"
          sx={{
            minWidth: { xs: 65, sm: 80 },
            flexShrink: 0,
            textAlign: 'right',
            fontWeight: hasValue ? 600 : 400,
            color: hasValue ? 'text.primary' : 'text.secondary',
          }}
        >
          {formatCurrency(sum)}
        </Typography>
      </Box>
    </Box>
  );
}
