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

        // For Category 12 (Verbrauchsmaterialien), include custom items section
        if (category.number === 12) {
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
              customItemsTotal={customItemsTotal}
            >
              {/* Custom items section within Category 12 */}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Sonstige Positionen (nicht im Tarif)
              </Typography>

              {/* Custom item rows */}
              {calculation.customItems.map((item, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1,
                    alignItems: { xs: 'stretch', sm: 'flex-start' },
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
                    sx={{ flex: { xs: 'none', sm: 2 } }}
                    fullWidth
                  />
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                    <TextField
                      size="small"
                      label="Preis"
                      type="number"
                      value={item.pricePerUnit || ''}
                      onChange={(e) =>
                        handleCustomItemFieldChange(index, 'pricePerUnit', e.target.value)
                      }
                      disabled={disabled}
                      inputProps={{ min: 0, step: 0.01 }}
                      sx={{ width: { xs: 90, sm: 100 } }}
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
                      sx={{ width: { xs: 70, sm: 80 } }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        minWidth: 70,
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
                </Box>
              ))}

              <Button
                startIcon={<AddIcon />}
                onClick={handleAddCustomItem}
                disabled={disabled}
                size="small"
              >
                Position hinzufügen
              </Button>
            </KostenersatzCategoryAccordion>
          );
        }

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
    </Box>
  );
}
