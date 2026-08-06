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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  formatCurrency,
  isHourlyRate,
  KostenersatzLineItem,
  KostenersatzRate,
} from '../../common/kostenersatz';

/**
 * The +/- buttons are only 28px, well below the ~44px recommended touch target,
 * so taps next to the icon are easy to miss on a phone. The pseudo element
 * enlarges the tappable area to 34x40px without changing the (very tight)
 * layout of the row.
 */
const touchTargetSx = {
  p: 0.5,
  '&::after': {
    content: '""',
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -3,
    right: -3,
  },
} as const;

/**
 * An in-progress edit of one of the inputs: the text the user sees, together
 * with the value it started from. Once the underlying value changes elsewhere,
 * `base` no longer matches and the input falls back to the current value.
 */
interface Edit {
  base: number;
  text: string;
}

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
  const t = useTranslations('kostenersatz.itemRow');
  const einheiten = item?.einheiten || 0;
  const stunden = item?.anzahlStunden || defaultStunden;
  const stundenOverridden = item?.stundenOverridden || false;
  const sum = item?.sum || 0;

  // The inputs show the value from `item` unless this row is in the middle of an
  // edit. An edit is tracked together with the value it started from, so it is
  // dropped as soon as the value changes elsewhere (loading a template, adding a
  // vehicle that maps to the same rate, changing the Einsatzdauer) instead of
  // leaving a stale number behind.
  const [einheitenEdit, setEinheitenEdit] = useState<Edit | null>(null);
  const [stundenEdit, setStundenEdit] = useState<Edit | null>(null);

  const localEinheiten =
    einheitenEdit?.base === einheiten
      ? einheitenEdit.text
      : einheiten > 0
        ? String(einheiten)
        : '';
  const localStunden =
    stundenEdit?.base === stunden ? stundenEdit.text : String(stunden);

  const editEinheiten = (text: string) => setEinheitenEdit({ base: einheiten, text });
  const editStunden = (text: string) => setStundenEdit({ base: stunden, text });

  // The number shown in the input drives +/-, so the buttons keep counting from
  // what the user sees — also for the very first unit, where no item exists yet.
  const parsedEinheiten = parseInt(localEinheiten, 10);
  const displayedEinheiten = isNaN(parsedEinheiten) ? 0 : parsedEinheiten;

  const hasValue = displayedEinheiten > 0;
  const showHours = isHourlyRate(rate);

  const handleEinheitenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    editEinheiten(value);

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
    const newValue = displayedEinheiten + 1;
    editEinheiten(String(newValue));
    const effectiveStunden = showHours
      ? stundenOverridden
        ? stunden
        : defaultStunden
      : 1;
    onItemChange(rate.id, newValue, effectiveStunden, showHours && stundenOverridden);
  };

  const handleEinheitenDecrement = () => {
    if (displayedEinheiten <= 0) return;
    const newValue = displayedEinheiten - 1;
    editEinheiten(newValue > 0 ? String(newValue) : '');
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
    editStunden(value);

    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      onItemChange(rate.id, displayedEinheiten, numValue, numValue !== defaultStunden);
    }
  };

  const handleToggleStundenOverride = () => {
    if (stundenOverridden) {
      // Reset to default
      editStunden(String(defaultStunden));
      onItemChange(rate.id, displayedEinheiten, defaultStunden, false);
    } else {
      // Enable override (keep current value)
      onItemChange(rate.id, displayedEinheiten, stunden, true);
    }
  };

  // Format price display based on whether it's hourly or per-unit
  const priceDisplay = showHours
    ? rate.pricePauschal
      ? t('pricePerHourFlat', {
          price: formatCurrency(rate.price),
          flat: formatCurrency(rate.pricePauschal),
        })
      : t('pricePerHour', { price: formatCurrency(rate.price) })
    : rate.price > 0
      ? formatCurrency(rate.price)
      : t('byEffort');

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
            {t('amountShort')}
          </Typography>
          <IconButton
            size="small"
            aria-label={t('decrease')}
            onClick={handleEinheitenDecrement}
            disabled={disabled || displayedEinheiten <= 0}
            sx={touchTargetSx}
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
            slotProps={{ htmlInput: { min: 0, style: { textAlign: 'center' } } }}
            sx={{ width: { xs: 45, sm: 55 }, '& input': { px: 0.5 } }}
          />
          <IconButton
            size="small"
            aria-label={t('increase')}
            onClick={handleEinheitenIncrement}
            disabled={disabled}
            sx={touchTargetSx}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Stunden input with lock toggle - only for hourly rates */}
        {showHours ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
              {t('hoursShort')}
            </Typography>
            <TextField
              size="small"
              type="number"
              value={localStunden}
              onChange={handleStundenChange}
              disabled={disabled || !hasValue}
              slotProps={{ htmlInput: { min: 0.5, step: 0.5, style: { textAlign: 'right' } } }}
              sx={{
                width: { xs: 50, sm: 60 },
                '& input': {
                  color: stundenOverridden ? 'warning.main' : 'inherit',
                },
              }}
            />
            <Tooltip
              title={
                stundenOverridden ? t('overrideTooltipOn') : t('overrideTooltipOff')
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
