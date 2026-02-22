'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  calculateDurationHours,
  calculateSubtotals,
  calculateTotalSum,
  createEmptyCalculation,
  KostenersatzCalculation,
  KostenersatzLineItem,
  KostenersatzCustomItem,
  KostenersatzRecipient,
} from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import { useKostenersatzRates, useKostenersatzVersions } from '../../hooks/useKostenersatz';
import {
  useKostenersatzAdd,
  useKostenersatzUpdate,
} from '../../hooks/useKostenersatzMutations';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import KostenersatzEinsatzTab from './KostenersatzEinsatzTab';
import KostenersatzBerechnungTab from './KostenersatzBerechnungTab';
import KostenersatzEmpfaengerTab from './KostenersatzEmpfaengerTab';
import KostenersatzSummaryFooter from './KostenersatzSummaryFooter';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`kostenersatz-tabpanel-${index}`}
      aria-labelledby={`kostenersatz-tab-${index}`}
      style={{ height: '100%', overflow: 'auto' }}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `kostenersatz-tab-${index}`,
    'aria-controls': `kostenersatz-tabpanel-${index}`,
  };
}

export interface KostenersatzDialogProps {
  open: boolean;
  onClose: (saved?: boolean) => void;
  firecall: Firecall;
  firecallId: string;
  existingCalculation?: KostenersatzCalculation;
}

export default function KostenersatzDialog({
  open,
  onClose,
  firecall,
  firecallId,
  existingCalculation,
}: KostenersatzDialogProps) {
  const [tabValue, setTabValue] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { email } = useFirebaseLogin();
  const { activeVersion } = useKostenersatzVersions();
  const { rates, ratesById } = useKostenersatzRates(activeVersion?.id);
  const addCalculation = useKostenersatzAdd(firecallId);
  const updateCalculation = useKostenersatzUpdate(firecallId);

  // Calculate initial duration from firecall for new calculations
  const initialDuration = useMemo(() => {
    return calculateDurationHours(firecall.alarmierung, firecall.abruecken) || 1;
  }, [firecall.alarmierung, firecall.abruecken]);

  // Initialize calculation state
  const [calculation, setCalculation] = useState<KostenersatzCalculation>(() => {
    if (existingCalculation) {
      return existingCalculation;
    }
    return {
      ...createEmptyCalculation(email || '', activeVersion?.id || 'LGBl_77_2023', initialDuration),
      id: undefined,
    } as KostenersatzCalculation;
  });

  // Calculate suggested duration considering overrides (after calculation state is available)
  const suggestedDuration = useMemo((): number => {
    const start = calculation.startDateOverride || firecall.alarmierung;
    const end = calculation.endDateOverride || firecall.abruecken;
    return calculateDurationHours(start, end) || 1;
  }, [calculation.startDateOverride, calculation.endDateOverride, firecall.alarmierung, firecall.abruecken]);

  // Update calculation when activeVersion changes (only for new calculations)
  useEffect(() => {
    if (!existingCalculation && activeVersion) {
      setCalculation((prev) => ({
        ...prev,
        rateVersion: activeVersion.id,
      }));
    }
  }, [activeVersion, existingCalculation]);

  // Recalculate totals when items change
  useEffect(() => {
    const subtotals = calculateSubtotals(calculation.items, rates);
    const totalSum = calculateTotalSum(calculation.items, calculation.customItems);
    setCalculation((prev) => ({
      ...prev,
      subtotals,
      totalSum,
    }));
  }, [calculation.items, calculation.customItems, rates]);

  const handleTabChange = (_event: SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Einsatz tab handlers
  const handleEinsatzChange = useCallback(
    (field: string, value: string | number) => {
      setCalculation((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  // Update all item hours when defaultStunden changes
  const handleDefaultStundenChange = useCallback(
    (newStunden: number) => {
      setCalculation((prev) => ({
        ...prev,
        defaultStunden: newStunden,
        items: prev.items.map((item) => {
          if (!item.stundenOverridden) {
            const rate = ratesById.get(item.rateId);
            if (rate) {
              const { calculateItemSum } = require('../../common/kostenersatz');
              return {
                ...item,
                anzahlStunden: newStunden,
                sum: calculateItemSum(newStunden, item.einheiten, rate.price, rate.pricePauschal, rate.pauschalHours),
              };
            }
          }
          return item;
        }),
      }));
    },
    [ratesById]
  );

  // Berechnung tab handlers
  const handleItemChange = useCallback(
    (rateId: string, einheiten: number, stunden: number, stundenOverridden: boolean) => {
      const rate = ratesById.get(rateId);
      if (!rate) return;

      const { calculateItemSum } = require('../../common/kostenersatz');
      const sum = calculateItemSum(stunden, einheiten, rate.price, rate.pricePauschal, rate.pauschalHours);

      setCalculation((prev) => {
        const existingIndex = prev.items.findIndex((i) => i.rateId === rateId);
        const newItem: KostenersatzLineItem = {
          rateId,
          einheiten,
          anzahlStunden: stunden,
          stundenOverridden,
          sum,
        };

        if (einheiten === 0) {
          // Remove item if einheiten is 0
          if (existingIndex >= 0) {
            const newItems = [...prev.items];
            newItems.splice(existingIndex, 1);
            return { ...prev, items: newItems };
          }
          return prev;
        }

        if (existingIndex >= 0) {
          // Update existing item
          const newItems = [...prev.items];
          newItems[existingIndex] = newItem;
          return { ...prev, items: newItems };
        } else {
          // Add new item
          return { ...prev, items: [...prev.items, newItem] };
        }
      });
    },
    [ratesById]
  );

  const handleCustomItemChange = useCallback(
    (index: number, item: KostenersatzCustomItem | null) => {
      setCalculation((prev) => {
        const newCustomItems = [...prev.customItems];
        if (item === null) {
          // Remove item
          newCustomItems.splice(index, 1);
        } else if (index >= newCustomItems.length) {
          // Add new item
          newCustomItems.push(item);
        } else {
          // Update existing
          newCustomItems[index] = item;
        }
        return { ...prev, customItems: newCustomItems };
      });
    },
    []
  );

  // Empfänger tab handlers
  const handleRecipientChange = useCallback((recipient: KostenersatzRecipient) => {
    setCalculation((prev) => ({
      ...prev,
      recipient,
    }));
  }, []);

  // Save handlers
  const handleSave = useCallback(
    async (status: 'draft' | 'completed') => {
      setIsSaving(true);
      try {
        const calcToSave = {
          ...calculation,
          status,
          updatedAt: new Date().toISOString(),
        };

        if (existingCalculation?.id) {
          await updateCalculation(calcToSave);
        } else {
          await addCalculation(calcToSave);
        }
        onClose(true);
      } catch (error) {
        console.error('Error saving calculation:', error);
        // TODO: Show error notification
      } finally {
        setIsSaving(false);
      }
    },
    [calculation, existingCalculation, addCalculation, updateCalculation, onClose]
  );

  const isEditable = !existingCalculation || existingCalculation.status === 'draft';

  return (
    <Dialog
      open={open}
      onClose={() => onClose()}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '90vh', maxHeight: '900px', display: 'flex', flexDirection: 'column' },
      }}
    >
      <DialogTitle>
        {existingCalculation ? 'Kostenersatz bearbeiten' : 'Neue Kostenersatz-Berechnung'}
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="kostenersatz tabs">
          <Tab label="Einsatz" {...a11yProps(0)} />
          <Tab label="Berechnung" {...a11yProps(1)} />
          <Tab label="Empfänger" {...a11yProps(2)} />
        </Tabs>
      </Box>

      <DialogContent sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <TabPanel value={tabValue} index={0}>
            <KostenersatzEinsatzTab
              firecall={firecall}
              calculation={calculation}
              suggestedDuration={suggestedDuration}
              onChange={handleEinsatzChange}
              onDefaultStundenChange={handleDefaultStundenChange}
              disabled={!isEditable}
            />
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            <KostenersatzBerechnungTab
              calculation={calculation}
              rates={rates}
              ratesById={ratesById}
              onItemChange={handleItemChange}
              onCustomItemChange={handleCustomItemChange}
              disabled={!isEditable}
            />
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            <KostenersatzEmpfaengerTab
              recipient={calculation.recipient}
              onChange={handleRecipientChange}
              disabled={!isEditable}
            />
          </TabPanel>
        </Box>
      </DialogContent>

      <KostenersatzSummaryFooter totalSum={calculation.totalSum} />

      <DialogActions>
        <Button color="inherit" onClick={() => onClose()} disabled={isSaving}>
          Abbrechen
        </Button>
        {isEditable && (
          <>
            <Button
              onClick={() => handleSave('draft')}
              disabled={isSaving}
            >
              Als Entwurf speichern
            </Button>
            <Button
              variant="contained"
              onClick={() => handleSave('completed')}
              disabled={isSaving || !calculation.recipient.name}
            >
              Abschließen
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
