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
  createLineItem,
  KostenersatzCalculation,
  KostenersatzLineItem,
  KostenersatzCustomItem,
  KostenersatzRecipient,
  KostenersatzVehicle,
} from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import { useKostenersatzRates, useKostenersatzVersions } from '../../hooks/useKostenersatz';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
import {
  useKostenersatzAdd,
  useKostenersatzUpdate,
  useKostenersatzDuplicate,
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Snackbar from '@mui/material/Snackbar';
import ConfirmDialog from '../dialogs/ConfirmDialog';
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
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const { email, isAdmin } = useFirebaseLogin();
  const { activeVersion } = useKostenersatzVersions();
  const { rates, ratesById } = useKostenersatzRates(activeVersion?.id);
  const { vehiclesById } = useKostenersatzVehicles();
  const addCalculation = useKostenersatzAdd(firecallId);
  const updateCalculation = useKostenersatzUpdate(firecallId);
  const duplicateCalculation = useKostenersatzDuplicate(firecallId);

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

  // Derive selected vehicle IDs from calculation
  const selectedVehicleIds = useMemo(() => {
    return calculation.vehicles || [];
  }, [calculation.vehicles]);

  // Vehicle toggle handler
  const handleVehicleToggle = useCallback(
    (vehicle: KostenersatzVehicle) => {
      const isSelected = selectedVehicleIds.includes(vehicle.id);
      const rate = ratesById.get(vehicle.rateId);

      if (!rate) {
        console.warn(`Rate ${vehicle.rateId} not found for vehicle ${vehicle.id}`);
        return;
      }

      setCalculation((prev) => {
        if (isSelected) {
          // Remove vehicle: remove from vehicles array and remove/decrement line item
          const newVehicles = (prev.vehicles || []).filter((id) => id !== vehicle.id);

          // Check if other selected vehicles use the same rate
          const otherVehiclesWithSameRate = newVehicles.filter((vId) => {
            const v = vehiclesById.get(vId);
            return v && v.rateId === vehicle.rateId;
          });

          let newItems: KostenersatzLineItem[];
          if (otherVehiclesWithSameRate.length > 0) {
            // Decrement the line item
            newItems = prev.items.map((item) =>
              item.rateId === vehicle.rateId
                ? { ...item, einheiten: item.einheiten - 1 }
                : item
            );
          } else {
            // Remove the line item entirely
            newItems = prev.items.filter((item) => item.rateId !== vehicle.rateId);
          }

          return {
            ...prev,
            vehicles: newVehicles,
            items: newItems,
          };
        } else {
          // Add vehicle: add to vehicles array and add/increment line item
          const newVehicles = [...(prev.vehicles || []), vehicle.id];

          // Check if rate already exists (multiple vehicles can map to same rate)
          const existingItemIndex = prev.items.findIndex(
            (item) => item.rateId === vehicle.rateId
          );

          let newItems: KostenersatzLineItem[];
          if (existingItemIndex >= 0) {
            // Increment existing item
            newItems = prev.items.map((item, idx) =>
              idx === existingItemIndex
                ? { ...item, einheiten: item.einheiten + 1 }
                : item
            );
          } else {
            // Add new item
            const newItem = createLineItem(
              vehicle.rateId,
              1, // einheiten
              prev.defaultStunden,
              rate,
              prev.defaultStunden
            );
            newItems = [...prev.items, newItem];
          }

          return {
            ...prev,
            vehicles: newVehicles,
            items: newItems,
          };
        }
      });
    },
    [selectedVehicleIds, ratesById, vehiclesById]
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
    async (status: 'draft' | 'completed', redirectAfterSave = true, showSuccessMessage = true): Promise<boolean> => {
      setIsSaving(true);
      try {
        const calcToSave = {
          ...calculation,
          status,
          updatedAt: new Date().toISOString(),
        };

        // Check both existing calculation ID and local state ID (for subsequent saves of new calculations)
        if (existingCalculation?.id || calculation.id) {
          await updateCalculation(calcToSave);
          // Update local status
          setCalculation((prev) => ({ ...prev, status }));
        } else {
          // Remove id field for new calculations (Firestore rejects undefined values)
          const { id: _id, ...calcWithoutId } = calcToSave;
          const newId = await addCalculation(calcWithoutId);
          // Update local state with the new ID and status so subsequent saves update instead of creating duplicates
          setCalculation((prev) => ({ ...prev, id: newId, status }));
        }
        if (redirectAfterSave) {
          router.push(`/einsatz/${firecallId}/kostenersatz`);
        } else if (showSuccessMessage) {
          setSuccessMessage('Gespeichert');
        }
        return true;
      } catch (error) {
        console.error('Error saving calculation:', error);
        // TODO: Show error notification
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [calculation, existingCalculation, addCalculation, updateCalculation, router, firecallId]
  );

  // Email button handler - completes the calculation first if needed, then opens email dialog
  const handleEmailClick = useCallback(async () => {
    const isNewOrDraft = !existingCalculation?.id && !calculation.id || calculation.status === 'draft';

    if (isNewOrDraft) {
      // Save and complete the calculation first
      const success = await handleSave('completed', false, false);
      if (!success) {
        return; // Save failed, don't open email dialog
      }
    }

    setEmailDialogOpen(true);
  }, [existingCalculation?.id, calculation.id, calculation.status, handleSave]);

  // Copy button handler - creates a draft copy and navigates to it
  const handleCopy = useCallback(async () => {
    setIsSaving(true);
    try {
      const newId = await duplicateCalculation(calculation as KostenersatzCalculation);
      router.push(`/einsatz/${firecallId}/kostenersatz/${newId}`);
    } catch (error) {
      console.error('Error copying calculation:', error);
    } finally {
      setIsSaving(false);
    }
  }, [calculation, duplicateCalculation, router, firecallId]);

  // Check local state status (which is updated after saves) to determine if editable
  const isEditable = calculation.status === 'draft';

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
            ? calculateItemSum(stunden, templateItem.einheiten, rate.price, rate.pricePauschal, rate.pauschalHours)
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
          {existingCalculation || calculation.id ? 'Kostenersatz bearbeiten' : 'Neue Kostenersatz-Berechnung'}
        </Typography>
        {isEditable && (
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
              onVehicleToggle={handleVehicleToggle}
              selectedVehicleIds={selectedVehicleIds}
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
                  onClick={() => handleSave('draft', false)}
                  disabled={isSaving}
                  size="small"
                >
                  Speichern
                </Button>
                <Button
                  variant="contained"
                  onClick={() => setConfirmCompleteOpen(true)}
                  disabled={isSaving || !calculation.recipient.name}
                  size="small"
                >
                  Abschließen
                </Button>
              </>
            )}
            {!isEditable && (
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopy}
                disabled={isSaving}
                size="small"
              >
                Kopieren
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<EmailIcon />}
              onClick={handleEmailClick}
              disabled={!calculation.recipient.email || isSaving}
              size="small"
            >
              E-Mail
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Email Dialog */}
      {(existingCalculation?.id || calculation.id) && (
        <KostenersatzEmailDialog
          open={emailDialogOpen}
          onClose={() => setEmailDialogOpen(false)}
          onSuccess={() => setSuccessMessage('E-Mail wurde erfolgreich gesendet')}
          calculation={calculation as KostenersatzCalculation}
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

      {/* Confirm Complete Dialog */}
      {confirmCompleteOpen && (
        <ConfirmDialog
          title="Berechnung abschließen"
          text="Nach dem Abschließen sind keine Änderungen mehr möglich. Möchten Sie fortfahren?"
          yes="Abschließen"
          no="Abbrechen"
          onConfirm={(confirmed) => {
            setConfirmCompleteOpen(false);
            if (confirmed) {
              handleSave('completed', false);
            }
          }}
        />
      )}

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
