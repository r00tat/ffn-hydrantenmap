'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import KostenersatzPdfButton from './KostenersatzPdfButton';
import KostenersatzEmailDialog from './KostenersatzEmailDialog';
import KostenersatzTemplateDialog from './KostenersatzTemplateDialog';
import KostenersatzTemplateSelector from './KostenersatzTemplateSelector';
import EmailIcon from '@mui/icons-material/Email';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Snackbar from '@mui/material/Snackbar';
import { KostenersatzTemplate, calculateItemSum } from '../../common/kostenersatz';

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

export interface KostenersatzCalculationPageProps {
  firecall: Firecall;
  firecallId: string;
  existingCalculation?: KostenersatzCalculation;
}

export default function KostenersatzCalculationPage({
  firecall,
  firecallId,
  existingCalculation,
}: KostenersatzCalculationPageProps) {
  const router = useRouter();
  const [tabValue, setTabValue] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [templateSaveDialogOpen, setTemplateSaveDialogOpen] = useState(false);
  const [templateLoadDialogOpen, setTemplateLoadDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { email, isAdmin } = useFirebaseLogin();
  const { activeVersion } = useKostenersatzVersions();
  const { rates, ratesById } = useKostenersatzRates(activeVersion?.id);
  const addCalculation = useKostenersatzAdd(firecallId);
  const updateCalculation = useKostenersatzUpdate(firecallId);

  // Calculate suggested duration from firecall
  const suggestedDuration = useMemo(() => {
    return calculateDurationHours(firecall.alarmierung, firecall.abruecken) || 1;
  }, [firecall.alarmierung, firecall.abruecken]);

  // Initialize calculation state
  const [calculation, setCalculation] = useState<KostenersatzCalculation>(() => {
    if (existingCalculation) {
      return existingCalculation;
    }
    return {
      ...createEmptyCalculation(email || '', activeVersion?.id || 'LGBl_77_2023', suggestedDuration),
      id: undefined,
    } as KostenersatzCalculation;
  });

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

  const handleBack = () => {
    router.push(`/einsatz/${firecallId}/kostenersatz`);
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
                sum: calculateItemSum(newStunden, item.einheiten, rate.price, rate.pricePauschal),
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
      const sum = calculateItemSum(stunden, einheiten, rate.price, rate.pricePauschal);

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
          // Remove id field for new calculations (Firestore rejects undefined values)
          const { id: _id, ...calcWithoutId } = calcToSave;
          await addCalculation(calcWithoutId);
        }
        router.push(`/einsatz/${firecallId}/kostenersatz`);
      } catch (error) {
        console.error('Error saving calculation:', error);
        // TODO: Show error notification
      } finally {
        setIsSaving(false);
      }
    },
    [calculation, existingCalculation, addCalculation, updateCalculation, router, firecallId]
  );

  const isEditable = !existingCalculation || existingCalculation.status === 'draft';

  // Template handlers
  const handleTemplateLoad = useCallback(
    (template: KostenersatzTemplate) => {
      // Convert template items to calculation items with calculated sums
      const newItems: KostenersatzLineItem[] = template.items.map((templateItem) => {
        const rate = ratesById.get(templateItem.rateId);
        const stunden = template.defaultStunden || calculation.defaultStunden;
        return {
          rateId: templateItem.rateId,
          einheiten: templateItem.einheiten,
          anzahlStunden: stunden,
          stundenOverridden: false,
          sum: rate
            ? calculateItemSum(stunden, templateItem.einheiten, rate.price, rate.pricePauschal)
            : 0,
        };
      });

      setCalculation((prev) => ({
        ...prev,
        items: newItems,
        defaultStunden: template.defaultStunden || prev.defaultStunden,
      }));

      setSuccessMessage(`Vorlage "${template.name}" geladen`);
    },
    [ratesById, calculation.defaultStunden]
  );

  const handleTemplateSaved = useCallback((saved?: boolean) => {
    setTemplateSaveDialogOpen(false);
    if (saved) {
      setSuccessMessage('Vorlage wurde gespeichert');
    }
  }, []);

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          color="inherit"
          size="small"
        >
          Zurück
        </Button>
        <Typography variant="h6" sx={{ flex: 1, minWidth: { xs: '100%', sm: 'auto' }, order: { xs: -1, sm: 0 } }}>
          {existingCalculation ? 'Kostenersatz bearbeiten' : 'Neue Kostenersatz-Berechnung'}
        </Typography>
        {!existingCalculation && isEditable && (
          <Button
            startIcon={<FolderOpenIcon />}
            onClick={() => setTemplateLoadDialogOpen(true)}
            size="small"
          >
            Vorlage laden
          </Button>
        )}
      </Box>

      <Paper sx={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 200px)' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="kostenersatz tabs">
            <Tab label="Einsatz" {...a11yProps(0)} />
            <Tab label="Berechnung" {...a11yProps(1)} />
            <Tab label="Empfänger" {...a11yProps(2)} />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
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

        <KostenersatzSummaryFooter totalSum={calculation.totalSum} />

        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          gap: 1,
          p: 2,
          borderTop: 1,
          borderColor: 'divider'
        }}>
          {/* Left side: Template and PDF */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {calculation.items.length > 0 && (
              <Button
                startIcon={<SaveIcon />}
                onClick={() => setTemplateSaveDialogOpen(true)}
                size="small"
              >
                Als Vorlage speichern
              </Button>
            )}
            <KostenersatzPdfButton
              calculation={calculation}
              firecall={firecall}
              rates={rates}
              variant="outlined"
            />
          </Box>

          {/* Right side: Actions */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
            <Button color="inherit" onClick={handleBack} disabled={isSaving} size="small">
              Abbrechen
            </Button>
            {isEditable && (
              <>
                <Button
                  onClick={() => handleSave('draft')}
                  disabled={isSaving}
                  size="small"
                >
                  Entwurf
                </Button>
                <Button
                  variant="contained"
                  onClick={() => handleSave('completed')}
                  disabled={isSaving || !calculation.recipient.name}
                  size="small"
                >
                  Abschließen
                </Button>
              </>
            )}
            {existingCalculation && existingCalculation.status !== 'draft' && (
              <Button
                variant="outlined"
                startIcon={<EmailIcon />}
                onClick={() => setEmailDialogOpen(true)}
                disabled={!calculation.recipient.email}
                size="small"
              >
                E-Mail
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Email Dialog */}
      {existingCalculation && (
        <KostenersatzEmailDialog
          open={emailDialogOpen}
          onClose={() => setEmailDialogOpen(false)}
          onSuccess={() => setSuccessMessage('E-Mail wurde erfolgreich gesendet')}
          calculation={existingCalculation}
          firecall={firecall}
          firecallId={firecallId}
        />
      )}

      {/* Template Save Dialog */}
      <KostenersatzTemplateDialog
        open={templateSaveDialogOpen}
        onClose={handleTemplateSaved}
        calculationItems={calculation.items}
        calculationDefaultStunden={calculation.defaultStunden}
        isAdmin={isAdmin}
      />

      {/* Template Load Dialog */}
      <KostenersatzTemplateSelector
        open={templateLoadDialogOpen}
        onClose={() => setTemplateLoadDialogOpen(false)}
        onSelect={handleTemplateLoad}
      />

      {/* Success Snackbar */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
    </Box>
  );
}
