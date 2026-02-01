'use client';

import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMemo } from 'react';
import {
  formatCurrency,
  KostenersatzCalculation,
  KostenersatzRate,
} from '../../common/kostenersatz';
import KostenersatzItemRow from './KostenersatzItemRow';

export interface KostenersatzCategoryAccordionProps {
  categoryNumber: number;
  categoryName: string;
  rates: KostenersatzRate[];
  calculation: KostenersatzCalculation;
  onItemChange: (
    rateId: string,
    einheiten: number,
    stunden: number,
    stundenOverridden: boolean
  ) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
  customItemsTotal?: number;
  children?: React.ReactNode;
}

/**
 * Check if a rate uses hourly pricing
 */
function isHourlyRate(rate: KostenersatzRate): boolean {
  if (rate.pricePauschal && rate.price > 0) {
    return true;
  }
  const hourlyUnits = ['je Std', 'pro Person & h', '/h'];
  return hourlyUnits.some((u) => rate.unit.includes(u));
}

export default function KostenersatzCategoryAccordion({
  categoryNumber,
  categoryName,
  rates,
  calculation,
  onItemChange,
  disabled = false,
  defaultExpanded = false,
  customItemsTotal = 0,
  children,
}: KostenersatzCategoryAccordionProps) {
  // Calculate subtotal for this category (including custom items if provided)
  const rateSubtotal = calculation.subtotals[String(categoryNumber)] || 0;
  const subtotal = rateSubtotal + customItemsTotal;
  const hasItems = subtotal > 0;

  // Count items with values in this category
  const itemCount = calculation.items.filter((item) =>
    rates.some((r) => r.id === item.rateId && item.einheiten > 0)
  ).length;

  // Check if any rates in this category use hourly pricing
  const hasHourlyRates = useMemo(
    () => rates.some((rate) => isHourlyRate(rate)),
    [rates]
  );

  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      sx={{
        '&:before': { display: 'none' },
        boxShadow: hasItems ? 2 : 1,
        borderLeft: hasItems ? 3 : 0,
        borderColor: 'primary.main',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          backgroundColor: hasItems ? 'action.selected' : 'background.paper',
          '&:hover': { backgroundColor: 'action.hover' },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            pr: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={hasItems ? 600 : 400}>
              {categoryNumber}. {categoryName}
            </Typography>
            {itemCount > 0 && (
              <Typography
                variant="caption"
                sx={{
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                }}
              >
                {itemCount}
              </Typography>
            )}
          </Box>
          <Typography
            variant="subtitle1"
            fontWeight={hasItems ? 600 : 400}
            color={hasItems ? 'primary.main' : 'text.secondary'}
          >
            {formatCurrency(subtotal)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
          }}
        >
          {/* Header row - hidden on mobile */}
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              px: 1,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ flex: 2 }}
            >
              Position
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ width: 70, textAlign: 'right' }}
            >
              Anzahl
            </Typography>
            {hasHourlyRates && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ width: 90, textAlign: 'right' }}
              >
                Stunden
              </Typography>
            )}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ width: 80, textAlign: 'right' }}
            >
              Summe
            </Typography>
          </Box>

          {/* Item rows */}
          {rates.map((rate) => (
            <KostenersatzItemRow
              key={rate.id}
              rate={rate}
              item={calculation.items.find((i) => i.rateId === rate.id)}
              defaultStunden={calculation.defaultStunden}
              onItemChange={onItemChange}
              disabled={disabled}
            />
          ))}

          {/* Additional content (e.g., custom items for Category 12) */}
          {children}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
