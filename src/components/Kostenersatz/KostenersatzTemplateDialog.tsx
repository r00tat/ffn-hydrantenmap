'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
import {
  KostenersatzTemplate,
  KostenersatzLineItem,
  KostenersatzRate,
  KostenersatzCalculation,
  KostenersatzCustomItem,
  KostenersatzVehicle,
  calculateItemSum,
  calculateTotalSum,
  calculateSubtotals,
  createLineItem,
  formatCurrency,
} from '../../common/kostenersatz';
import {
  useKostenersatzTemplateAdd,
  useKostenersatzTemplateUpdate,
} from '../../hooks/useKostenersatzMutations';
import KostenersatzBerechnungTab from './KostenersatzBerechnungTab';

export interface KostenersatzTemplateDialogProps {
  open: boolean;
  onClose: (saved?: boolean) => void;
  existingTemplate?: KostenersatzTemplate;
  /** For creating a new template from a calculation */
  calculationItems?: KostenersatzLineItem[];
  calculationDefaultStunden?: number;
  calculationVehicles?: string[];
  isAdmin?: boolean;
  /** Rates for displaying item descriptions when editing */
  rates?: KostenersatzRate[];
}

/**
 * Build a KostenersatzCalculation object from template data for use with BerechnungTab.
 */
function buildCalculationFromTemplate(
  items: { rateId: string; einheiten: number }[],
  vehicles: string[],
  defaultStunden: number,
  rates: KostenersatzRate[],
): KostenersatzCalculation {
  const ratesById = new Map(rates.map((r) => [r.id, r]));
  const lineItems: KostenersatzLineItem[] = items.map((item) => {
    const rate = ratesById.get(item.rateId);
    return {
      rateId: item.rateId,
      einheiten: item.einheiten,
      anzahlStunden: defaultStunden,
      stundenOverridden: false,
      sum: rate
        ? calculateItemSum(defaultStunden, item.einheiten, rate.price, rate.pricePauschal, rate.pauschalHours)
        : 0,
    };
  });

  const subtotals = calculateSubtotals(lineItems, rates);
  const totalSum = calculateTotalSum(lineItems, []);

  return {
    createdBy: '',
    createdAt: '',
    updatedAt: '',
    status: 'draft',
    rateVersion: '',
    comment: '',
    defaultStunden,
    recipient: { name: '', address: '', phone: '', email: '', paymentMethod: 'rechnung' },
    items: lineItems,
    customItems: [],
    subtotals,
    totalSum,
    vehicles,
  } as KostenersatzCalculation;
}

const EMPTY_RATES: KostenersatzRate[] = [];

export default function KostenersatzTemplateDialog({
  open,
  onClose,
  existingTemplate,
  calculationItems,
  calculationDefaultStunden,
  calculationVehicles,
  isAdmin = false,
  rates = EMPTY_RATES,
}: KostenersatzTemplateDialogProps) {
  const t = useTranslations('kostenersatz.templateDialog');
  const tCommon = useTranslations('common');
  const { vehiclesById } = useKostenersatzVehicles();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [calculation, setCalculation] = useState<KostenersatzCalculation>(() =>
    buildCalculationFromTemplate([], [], 1, rates)
  );

  const ratesById = useMemo(() => new Map(rates.map((r) => [r.id, r])), [rates]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(existingTemplate?.name || '');
      setDescription(existingTemplate?.description || '');
      setIsShared(existingTemplate?.isShared || false);

      const items = calculationItems
        ? calculationItems.map((item) => ({ rateId: item.rateId, einheiten: item.einheiten }))
        : existingTemplate?.items || [];
      const vehicles = calculationVehicles || existingTemplate?.vehicles || [];
      const defaultStunden = (calculationItems ? calculationDefaultStunden : existingTemplate?.defaultStunden) || 1;

      setCalculation(buildCalculationFromTemplate(items, vehicles, defaultStunden, rates));
    }
  }, [open, existingTemplate, calculationItems, calculationDefaultStunden, calculationVehicles, rates]);

  // Item change handler (same pattern as KostenersatzCalculationPage)
  const handleItemChange = useCallback(
    (rateId: string, einheiten: number, stunden: number, stundenOverridden: boolean) => {
      const rate = ratesById.get(rateId);
      if (!rate) return;

      const sum = calculateItemSum(stunden, einheiten, rate.price, rate.pricePauschal, rate.pauschalHours);

      setCalculation((prev) => {
        const existingIndex = prev.items.findIndex((i) => i.rateId === rateId);
        const newItem: KostenersatzLineItem = { rateId, einheiten, anzahlStunden: stunden, stundenOverridden, sum };

        let newItems: KostenersatzLineItem[];
        if (einheiten === 0) {
          newItems = existingIndex >= 0
            ? prev.items.filter((_, i) => i !== existingIndex)
            : prev.items;
        } else if (existingIndex >= 0) {
          newItems = [...prev.items];
          newItems[existingIndex] = newItem;
        } else {
          newItems = [...prev.items, newItem];
        }

        const subtotals = calculateSubtotals(newItems, rates);
        const totalSum = calculateTotalSum(newItems, prev.customItems);
        return { ...prev, items: newItems, subtotals, totalSum };
      });
    },
    [ratesById, rates]
  );

  // Custom item change handler
  const handleCustomItemChange = useCallback(
    (index: number, item: KostenersatzCustomItem | null) => {
      setCalculation((prev) => {
        const newCustomItems = [...prev.customItems];
        if (item === null) {
          newCustomItems.splice(index, 1);
        } else if (index >= newCustomItems.length) {
          newCustomItems.push(item);
        } else {
          newCustomItems[index] = item;
        }
        const totalSum = calculateTotalSum(prev.items, newCustomItems);
        return { ...prev, customItems: newCustomItems, totalSum };
      });
    },
    []
  );

  // Vehicle toggle handler (same pattern as KostenersatzCalculationPage)
  const handleVehicleToggle = useCallback(
    (vehicle: KostenersatzVehicle) => {
      const rate = ratesById.get(vehicle.rateId);
      if (!rate) return;

      setCalculation((prev) => {
        const isSelected = (prev.vehicles || []).includes(vehicle.id);

        if (isSelected) {
          const newVehicles = (prev.vehicles || []).filter((id) => id !== vehicle.id);
          const otherVehiclesWithSameRate = newVehicles.filter((vId) => {
            const v = vehiclesById.get(vId);
            return v && v.rateId === vehicle.rateId;
          });

          let newItems: KostenersatzLineItem[];
          if (otherVehiclesWithSameRate.length > 0) {
            newItems = prev.items.map((item) => {
              if (item.rateId !== vehicle.rateId) return item;
              const newEinheiten = item.einheiten - 1;
              return {
                ...item,
                einheiten: newEinheiten,
                sum: calculateItemSum(item.anzahlStunden, newEinheiten, rate.price, rate.pricePauschal, rate.pauschalHours),
              };
            });
          } else {
            newItems = prev.items.filter((item) => item.rateId !== vehicle.rateId);
          }

          const subtotals = calculateSubtotals(newItems, rates);
          const totalSum = calculateTotalSum(newItems, prev.customItems);
          return { ...prev, vehicles: newVehicles, items: newItems, subtotals, totalSum };
        } else {
          const newVehicles = [...(prev.vehicles || []), vehicle.id];
          const existingItemIndex = prev.items.findIndex((item) => item.rateId === vehicle.rateId);

          let newItems: KostenersatzLineItem[];
          if (existingItemIndex >= 0) {
            newItems = prev.items.map((item, idx) => {
              if (idx !== existingItemIndex) return item;
              const newEinheiten = item.einheiten + 1;
              return {
                ...item,
                einheiten: newEinheiten,
                sum: calculateItemSum(item.anzahlStunden, newEinheiten, rate.price, rate.pricePauschal, rate.pauschalHours),
              };
            });
          } else {
            const newItem = createLineItem(vehicle.rateId, 1, prev.defaultStunden, rate, prev.defaultStunden);
            newItems = [...prev.items, newItem];
          }

          const subtotals = calculateSubtotals(newItems, rates);
          const totalSum = calculateTotalSum(newItems, prev.customItems);
          return { ...prev, vehicles: newVehicles, items: newItems, subtotals, totalSum };
        }
      });
    },
    [ratesById, vehiclesById, rates]
  );

  const selectedVehicleIds = useMemo(() => calculation.vehicles || [], [calculation.vehicles]);

  const addTemplate = useKostenersatzTemplateAdd();
  const updateTemplate = useKostenersatzTemplateUpdate();

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const trimmedDescription = description.trim();
      const templateItems = calculation.items.map((item) => ({
        rateId: item.rateId,
        einheiten: item.einheiten,
      }));
      const templateVehicles = (calculation.vehicles || []).length > 0
        ? calculation.vehicles
        : undefined;

      if (existingTemplate?.id) {
        await updateTemplate({
          ...existingTemplate,
          name: name.trim(),
          description: trimmedDescription || '',
          isShared,
          items: templateItems,
          defaultStunden: calculation.defaultStunden,
          vehicles: templateVehicles,
        });
      } else {
        await addTemplate({
          name: name.trim(),
          ...(trimmedDescription && { description: trimmedDescription }),
          isShared,
          items: templateItems,
          defaultStunden: calculation.defaultStunden,
          vehicles: templateVehicles,
        });
      }
      onClose(true);
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose()} maxWidth="md" fullWidth>
      <DialogTitle>
        {existingTemplate?.id ? t('editTitle') : t('saveTitle')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label={t('name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label={t('description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            label={t('defaultHours')}
            type="number"
            value={calculation.defaultStunden}
            onChange={(e) => {
              const newStunden = Math.max(0.5, parseFloat(e.target.value) || 1);
              setCalculation((prev) => {
                const newItems = prev.items.map((item) => {
                  if (item.stundenOverridden) return item;
                  const rate = ratesById.get(item.rateId);
                  return {
                    ...item,
                    anzahlStunden: newStunden,
                    sum: rate
                      ? calculateItemSum(newStunden, item.einheiten, rate.price, rate.pricePauschal, rate.pauschalHours)
                      : item.sum,
                  };
                });
                const subtotals = calculateSubtotals(newItems, rates);
                const totalSum = calculateTotalSum(newItems, prev.customItems);
                return { ...prev, defaultStunden: newStunden, items: newItems, subtotals, totalSum };
              });
            }}
            slotProps={{ htmlInput: { min: 0.5, step: 0.5 } }}
            sx={{ width: 200 }}
          />
          {isAdmin && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                />
              }
              label={t('shareWithAll')}
            />
          )}

          {/* Full calculation editing UI */}
          <KostenersatzBerechnungTab
            calculation={calculation}
            rates={rates}
            ratesById={ratesById}
            onItemChange={handleItemChange}
            onCustomItemChange={handleCustomItemChange}
            onVehicleToggle={handleVehicleToggle}
            selectedVehicleIds={selectedVehicleIds}
            disabled={isSaving}
          />

          {/* Total */}
          {calculation.totalSum > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
              <Typography variant="h6">
                {t('total', { amount: formatCurrency(calculation.totalSum) })}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={isSaving}>
          {tCommon('cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
