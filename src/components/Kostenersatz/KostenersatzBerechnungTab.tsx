'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMemo } from 'react';
import {
  calculateCustomItemSum,
  formatCurrency,
  KostenersatzCalculation,
  KostenersatzCustomItem,
  KostenersatzRate,
} from '../../common/kostenersatz';
import { getCategoryList } from '../../common/defaultKostenersatzRates';
import KostenersatzCategoryAccordion from './KostenersatzCategoryAccordion';

export interface KostenersatzBerechnungTabProps {
  calculation: KostenersatzCalculation;
  rates: KostenersatzRate[];
  ratesById: Map<string, KostenersatzRate>;
  onItemChange: (
    rateId: string,
    einheiten: number,
    stunden: number,
    stundenOverridden: boolean
  ) => void;
  onCustomItemChange: (index: number, item: KostenersatzCustomItem | null) => void;
  disabled?: boolean;
}

export default function KostenersatzBerechnungTab({
  calculation,
  rates,
  ratesById,
  onItemChange,
  onCustomItemChange,
  disabled = false,
}: KostenersatzBerechnungTabProps) {
  // Get category list for rendering accordions
  const categories = useMemo(() => getCategoryList(rates), [rates]);

  // Group rates by category
  const ratesByCategory = useMemo(() => {
    const grouped = new Map<number, KostenersatzRate[]>();
    rates.forEach((rate) => {
      const existing = grouped.get(rate.categoryNumber) || [];
      existing.push(rate);
      grouped.set(rate.categoryNumber, existing);
    });
    return grouped;
  }, [rates]);

  const handleCustomItemFieldChange = (
    index: number,
    field: keyof KostenersatzCustomItem,
    value: string | number
  ) => {
    const existing = calculation.customItems[index];
    if (!existing) return;

    let updatedItem: KostenersatzCustomItem;
    if (field === 'quantity' || field === 'pricePerUnit') {
      const quantity = field === 'quantity' ? Number(value) : existing.quantity;
      const pricePerUnit = field === 'pricePerUnit' ? Number(value) : existing.pricePerUnit;
      updatedItem = {
        ...existing,
        [field]: Number(value),
        sum: calculateCustomItemSum(quantity, pricePerUnit),
      };
    } else {
      updatedItem = {
        ...existing,
        [field]: value,
      };
    }
    onCustomItemChange(index, updatedItem);
  };

  const handleAddCustomItem = () => {
    onCustomItemChange(calculation.customItems.length, {
      description: '',
      unit: '',
      pricePerUnit: 0,
      quantity: 0,
      sum: 0,
    });
  };

  const handleDeleteCustomItem = (index: number) => {
    onCustomItemChange(index, null);
  };

  // Calculate custom items total
  const customItemsTotal = calculation.customItems.reduce((sum, item) => sum + item.sum, 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Category accordions */}
      {categories.map((category, idx) => {
        const categoryRates = ratesByCategory.get(category.number) || [];
        // Skip category 12 (Sonstige Leistungen) as it's handled separately
        if (category.number === 12) return null;

        return (
          <KostenersatzCategoryAccordion
            key={category.number}
            categoryNumber={category.number}
            categoryName={category.name}
            rates={categoryRates}
            calculation={calculation}
            onItemChange={onItemChange}
            disabled={disabled}
            defaultExpanded={idx === 0}
          />
        );
      })}

      {/* Custom items section (Tarif D - Sonstige Leistungen) */}
      <Divider sx={{ my: 2 }} />
      <Box sx={{ px: 1 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography variant="subtitle1" fontWeight={500}>
            12. Sonstige Leistungen (individuell)
          </Typography>
          <Typography
            variant="subtitle1"
            fontWeight={customItemsTotal > 0 ? 600 : 400}
            color={customItemsTotal > 0 ? 'primary.main' : 'text.secondary'}
          >
            {formatCurrency(customItemsTotal)}
          </Typography>
        </Box>

        {calculation.customItems.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Keine individuellen Positionen hinzugefügt
          </Typography>
        )}

        {/* Custom item rows */}
        {calculation.customItems.map((item, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
              mb: 1,
              p: 1,
              backgroundColor: 'action.hover',
              borderRadius: 1,
            }}
          >
            <TextField
              size="small"
              label="Beschreibung"
              value={item.description}
              onChange={(e) =>
                handleCustomItemFieldChange(index, 'description', e.target.value)
              }
              disabled={disabled}
              sx={{ flex: 2 }}
            />
            <TextField
              size="small"
              label="Einheit"
              value={item.unit}
              onChange={(e) =>
                handleCustomItemFieldChange(index, 'unit', e.target.value)
              }
              disabled={disabled}
              sx={{ width: 100 }}
            />
            <TextField
              size="small"
              label="Preis/Einheit"
              type="number"
              value={item.pricePerUnit || ''}
              onChange={(e) =>
                handleCustomItemFieldChange(index, 'pricePerUnit', e.target.value)
              }
              disabled={disabled}
              inputProps={{ min: 0, step: 0.01 }}
              sx={{ width: 100 }}
            />
            <TextField
              size="small"
              label="Anzahl"
              type="number"
              value={item.quantity || ''}
              onChange={(e) =>
                handleCustomItemFieldChange(index, 'quantity', e.target.value)
              }
              disabled={disabled}
              inputProps={{ min: 0 }}
              sx={{ width: 80 }}
            />
            <Typography
              variant="body2"
              sx={{
                width: 90,
                textAlign: 'right',
                pt: 1,
                fontWeight: 500,
              }}
            >
              {formatCurrency(item.sum)}
            </Typography>
            <IconButton
              size="small"
              onClick={() => handleDeleteCustomItem(index)}
              disabled={disabled}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}

        <Button
          startIcon={<AddIcon />}
          onClick={handleAddCustomItem}
          disabled={disabled}
          sx={{ mt: 1 }}
        >
          Position hinzufügen
        </Button>
      </Box>
    </Box>
  );
}
