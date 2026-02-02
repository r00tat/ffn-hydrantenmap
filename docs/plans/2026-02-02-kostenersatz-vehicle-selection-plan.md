# Kostenersatz Vehicle Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add vehicle quick-selection to Kostenersatz calculations with admin management, template integration, and tabbed admin UI.

**Architecture:** New Firestore collection `kostenersatzVehicles` stores department vehicles mapped to rate IDs. A `VehicleQuickAddPanel` component provides toggle-style vehicle selection that syncs with calculation items. Admin UI restructured into tabs.

**Tech Stack:** React 19, TypeScript, MUI, Firebase Firestore, existing Kostenersatz hooks pattern

---

## Task 1: Add Vehicle Type and Constants

**Files:**
- Modify: `src/common/kostenersatz.ts`

**Step 1: Add KostenersatzVehicle type and collection constant**

Add after line 131 (after `KOSTENERSATZ_SUBCOLLECTION`):

```typescript
export const KOSTENERSATZ_VEHICLES_COLLECTION = 'kostenersatzVehicles';

// ============================================================================
// Vehicle Types
// ============================================================================

export interface KostenersatzVehicle {
  id: string;           // e.g., "kdtfa", "rlfa-3000"
  name: string;         // e.g., "KDTFA", "RLFA 3000/100"
  rateId: string;       // e.g., "2.01", "2.05"
  description?: string; // e.g., "Kommando Neusiedl am See"
  sortOrder: number;    // For consistent display order
}
```

**Step 2: Update KostenersatzTemplate type**

Find the `KostenersatzTemplate` interface (around line 48) and add after `defaultStunden`:

```typescript
  vehicles?: string[]; // Array of vehicle IDs included in template
```

**Step 3: Update KostenersatzCalculation type**

Find the `KostenersatzCalculation` interface (around line 91) and add after `totalSum`:

```typescript
  // Selected vehicles
  vehicles?: string[];
```

**Step 4: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/common/kostenersatz.ts
git commit -m "feat(kostenersatz): add vehicle type and update template/calculation types"
```

---

## Task 2: Add Default Vehicles

**Files:**
- Modify: `src/common/defaultKostenersatzRates.ts`

**Step 1: Add DEFAULT_VEHICLES array**

Add at the end of the file, before the closing of the module (after `getCategoryList` function):

```typescript
// ============================================================================
// Default Vehicles
// ============================================================================

import { KostenersatzVehicle } from './kostenersatz';

export const DEFAULT_VEHICLES: Omit<KostenersatzVehicle, 'id'>[] = [
  {
    name: 'KDTFA',
    rateId: '2.01',
    description: 'Kommando Neusiedl am See',
    sortOrder: 1,
  },
  {
    name: 'RLFA 3000/100',
    rateId: '2.05',
    description: 'RüstLösch Neusiedl am See',
    sortOrder: 2,
  },
  {
    name: 'TLFA 4000',
    rateId: '2.05',
    description: 'Tank1 Neusiedl am See',
    sortOrder: 3,
  },
  {
    name: 'TB 23/12',
    rateId: '2.06',
    description: 'Hubsteiger Neusiedl am See',
    sortOrder: 4,
  },
  {
    name: 'SRF',
    rateId: '2.10',
    description: 'Rüst Neusiedl am See',
    sortOrder: 5,
  },
  {
    name: 'KRF-S',
    rateId: '2.02',
    description: 'Kleinrüst Neusiedl am See',
    sortOrder: 6,
  },
  {
    name: 'MTFA',
    rateId: '2.01',
    description: 'MTF Neusiedl am See',
    sortOrder: 7,
  },
  {
    name: 'VF - Sprinter',
    rateId: '2.02',
    description: 'VF Neusiedl am See',
    sortOrder: 8,
  },
  {
    name: 'VF-KAT',
    rateId: '2.04',
    description: 'Kat LKW Neusiedl am See',
    sortOrder: 9,
  },
  {
    name: 'WLF-K',
    rateId: '2.10',
    description: 'Wechselladefahrzeug mit Kran',
    sortOrder: 10,
  },
  {
    name: 'WLA-Bergung',
    rateId: '2.18',
    description: 'Bergemulde',
    sortOrder: 11,
  },
  {
    name: 'WLA-Logistik',
    rateId: '2.17',
    description: 'Logistik Mulde mit Schadstoffausrüstung',
    sortOrder: 12,
  },
  {
    name: 'Öl Einachsanhänger',
    rateId: '2.13',
    sortOrder: 13,
  },
  {
    name: 'ATS Einachsanhänger',
    rateId: '2.13',
    sortOrder: 14,
  },
  {
    name: 'Bootsanhänger',
    rateId: '2.14',
    sortOrder: 15,
  },
  {
    name: 'Ölsperrenanhänger',
    rateId: '2.14',
    description: 'Ölsperranhänger',
    sortOrder: 16,
  },
];

/**
 * Generate vehicle ID from name (lowercase, replace spaces with hyphens)
 */
export function generateVehicleId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (match) => {
      const replacements: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };
      return replacements[match] || match;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get default vehicles with generated IDs
 */
export function getDefaultVehicles(): KostenersatzVehicle[] {
  return DEFAULT_VEHICLES.map((vehicle) => ({
    ...vehicle,
    id: generateVehicleId(vehicle.name),
  }));
}
```

**Step 2: Add import at top of file**

Add to imports at top:

```typescript
import { KostenersatzVehicle } from './kostenersatz';
```

**Step 3: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/common/defaultKostenersatzRates.ts
git commit -m "feat(kostenersatz): add default vehicles for FF Neusiedl am See"
```

---

## Task 3: Create Vehicle Hooks

**Files:**
- Create: `src/hooks/useKostenersatzVehicles.ts`

**Step 1: Create the vehicles hook file**

```typescript
'use client';

import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  KostenersatzVehicle,
  KOSTENERSATZ_VEHICLES_COLLECTION,
} from '../common/kostenersatz';
import { getDefaultVehicles } from '../common/defaultKostenersatzRates';

/**
 * Load all vehicles from Firestore
 * Falls back to default vehicles if none exist
 */
export function useKostenersatzVehicles() {
  const [firestoreVehicles, setFirestoreVehicles] = useState<KostenersatzVehicle[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(firestore, KOSTENERSATZ_VEHICLES_COLLECTION),
      orderBy('sortOrder', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const vehicleList: KostenersatzVehicle[] = [];
        snapshot.forEach((doc) => {
          vehicleList.push({
            id: doc.id,
            ...doc.data(),
          } as KostenersatzVehicle);
        });
        setFirestoreVehicles(vehicleList);
        setFirestoreLoading(false);
      },
      (err) => {
        console.error('Error loading kostenersatz vehicles:', err);
        setError(err);
        setFirestoreLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Use default vehicles if none in Firestore
  const vehicles = useMemo(() => {
    if (firestoreVehicles.length === 0) {
      return getDefaultVehicles();
    }
    return firestoreVehicles;
  }, [firestoreVehicles]);

  // Create lookup map by ID
  const vehiclesById = useMemo(() => {
    const map = new Map<string, KostenersatzVehicle>();
    vehicles.forEach((v) => map.set(v.id, v));
    return map;
  }, [vehicles]);

  // Check if using Firestore or defaults
  const isUsingDefaults = firestoreVehicles.length === 0;

  return {
    vehicles,
    vehiclesById,
    loading: firestoreLoading,
    error,
    isUsingDefaults,
  };
}
```

**Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/hooks/useKostenersatzVehicles.ts
git commit -m "feat(kostenersatz): add useKostenersatzVehicles hook"
```

---

## Task 4: Add Vehicle Mutations

**Files:**
- Modify: `src/hooks/useKostenersatzMutations.ts`

**Step 1: Add imports**

Add to imports at top (around line 19-26):

```typescript
import {
  KostenersatzVehicle,
  KOSTENERSATZ_VEHICLES_COLLECTION,
} from '../common/kostenersatz';
import { getDefaultVehicles } from '../common/defaultKostenersatzRates';
```

**Step 2: Add vehicle mutations at end of file**

Add after `useKostenersatzSeedDefaultRates` (after line 437):

```typescript
// ============================================================================
// Vehicle Mutations (Admin only)
// ============================================================================

/**
 * Hook to add or update a vehicle
 */
export function useKostenersatzVehicleUpsert() {
  return useCallback(async (vehicle: KostenersatzVehicle) => {
    console.info(`Upserting kostenersatz vehicle ${vehicle.id}: ${vehicle.name}`);

    await setDoc(
      doc(firestore, KOSTENERSATZ_VEHICLES_COLLECTION, vehicle.id),
      vehicle
    );
  }, []);
}

/**
 * Hook to delete a vehicle
 */
export function useKostenersatzVehicleDelete() {
  return useCallback(async (vehicleId: string) => {
    console.info(`Deleting kostenersatz vehicle ${vehicleId}`);

    await deleteDoc(doc(firestore, KOSTENERSATZ_VEHICLES_COLLECTION, vehicleId));
  }, []);
}

/**
 * Hook to seed default vehicles
 */
export function useKostenersatzSeedDefaultVehicles() {
  return useCallback(async () => {
    const batch = writeBatch(firestore);
    const defaultVehicles = getDefaultVehicles();

    for (const vehicle of defaultVehicles) {
      batch.set(
        doc(firestore, KOSTENERSATZ_VEHICLES_COLLECTION, vehicle.id),
        vehicle
      );
    }

    console.info(`Seeding ${defaultVehicles.length} default vehicles`);

    await batch.commit();
  }, []);
}
```

**Step 3: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/hooks/useKostenersatzMutations.ts
git commit -m "feat(kostenersatz): add vehicle CRUD and seed mutations"
```

---

## Task 5: Create Vehicle Admin Tab Component

**Files:**
- Create: `src/components/Kostenersatz/KostenersatzVehicleTab.tsx`

**Step 1: Create the vehicle admin tab**

```typescript
'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useState } from 'react';
import {
  KostenersatzRate,
  KostenersatzVehicle,
} from '../../common/kostenersatz';
import { generateVehicleId } from '../../common/defaultKostenersatzRates';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
import {
  useKostenersatzVehicleUpsert,
  useKostenersatzVehicleDelete,
  useKostenersatzSeedDefaultVehicles,
} from '../../hooks/useKostenersatzMutations';

interface KostenersatzVehicleTabProps {
  rates: KostenersatzRate[];
}

export default function KostenersatzVehicleTab({ rates }: KostenersatzVehicleTabProps) {
  const { vehicles, loading, isUsingDefaults } = useKostenersatzVehicles();
  const upsertVehicle = useKostenersatzVehicleUpsert();
  const deleteVehicle = useKostenersatzVehicleDelete();
  const seedVehicles = useKostenersatzSeedDefaultVehicles();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<KostenersatzVehicle | null>(null);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRateId, setFormRateId] = useState('');

  // Filter rates to categories 2, 4, 8
  const vehicleRates = rates.filter((r) => [2, 4, 8].includes(r.categoryNumber));

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setFormName('');
    setFormDescription('');
    setFormRateId('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (vehicle: KostenersatzVehicle) => {
    setEditingVehicle(vehicle);
    setFormName(vehicle.name);
    setFormDescription(vehicle.description || '');
    setFormRateId(vehicle.rateId);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingVehicle(null);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formRateId) return;

    setSaving(true);
    try {
      const vehicleId = editingVehicle?.id || generateVehicleId(formName);
      const sortOrder = editingVehicle?.sortOrder || vehicles.length + 1;

      await upsertVehicle({
        id: vehicleId,
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        rateId: formRateId,
        sortOrder,
      });
      handleCloseDialog();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      alert('Fehler beim Speichern des Fahrzeugs.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicle: KostenersatzVehicle) => {
    if (confirm(`Fahrzeug "${vehicle.name}" wirklich löschen?`)) {
      try {
        await deleteVehicle(vehicle.id);
      } catch (error) {
        console.error('Error deleting vehicle:', error);
        alert('Fehler beim Löschen des Fahrzeugs.');
      }
    }
  };

  const handleSeedVehicles = async () => {
    setSeeding(true);
    try {
      await seedVehicles();
      setSeedDialogOpen(false);
    } catch (error) {
      console.error('Error seeding vehicles:', error);
      alert('Fehler beim Laden der Standard-Fahrzeuge.');
    } finally {
      setSeeding(false);
    }
  };

  // Get rate description for display
  const getRateDescription = (rateId: string): string => {
    const rate = rates.find((r) => r.id === rateId);
    return rate ? rate.description : rateId;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Fahrzeuge</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => setSeedDialogOpen(true)}
            variant="outlined"
          >
            Standard-Fahrzeuge laden
          </Button>
          <Button
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            variant="contained"
          >
            Fahrzeug hinzufügen
          </Button>
        </Box>
      </Box>

      {isUsingDefaults && (
        <Typography variant="body2" color="text.secondary">
          Zeigt Standard-Fahrzeuge. Klicken Sie &quot;Standard-Fahrzeuge laden&quot; um sie in die Datenbank zu übernehmen.
        </Typography>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Beschreibung</TableCell>
            <TableCell>Tarif</TableCell>
            <TableCell align="center" sx={{ width: 100 }}>Aktionen</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {vehicles.map((vehicle) => (
            <TableRow key={vehicle.id}>
              <TableCell>
                <Typography fontWeight={500}>{vehicle.name}</Typography>
              </TableCell>
              <TableCell>{vehicle.description || '-'}</TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {vehicle.rateId} - {getRateDescription(vehicle.rateId)}
                </Typography>
              </TableCell>
              <TableCell align="center">
                <IconButton
                  size="small"
                  onClick={() => handleOpenEdit(vehicle)}
                  title="Bearbeiten"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(vehicle)}
                  title="Löschen"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          {vehicles.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} align="center">
                <Typography color="text.secondary">
                  Keine Fahrzeuge vorhanden.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingVehicle ? 'Fahrzeug bearbeiten' : 'Fahrzeug hinzufügen'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              fullWidth
              required
              autoFocus
              placeholder="z.B. RLFA 3000"
            />
            <TextField
              label="Beschreibung (optional)"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              fullWidth
              placeholder="z.B. RüstLösch Neusiedl am See"
            />
            <FormControl fullWidth required>
              <InputLabel>Tarif</InputLabel>
              <Select
                value={formRateId}
                onChange={(e) => setFormRateId(e.target.value)}
                label="Tarif"
              >
                {vehicleRates.map((rate) => (
                  <MenuItem key={rate.id} value={rate.id}>
                    {rate.id} - {rate.description}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !formName.trim() || !formRateId}
          >
            {saving ? <CircularProgress size={20} /> : 'Speichern'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Seed Dialog */}
      <Dialog open={seedDialogOpen} onClose={() => setSeedDialogOpen(false)}>
        <DialogTitle>Standard-Fahrzeuge laden</DialogTitle>
        <DialogContent>
          <Typography>
            Möchten Sie die Standard-Fahrzeuge der FF Neusiedl am See in die Datenbank laden?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Bestehende Fahrzeuge mit gleicher ID werden überschrieben.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeedDialogOpen(false)} disabled={seeding}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            onClick={handleSeedVehicles}
            disabled={seeding}
          >
            {seeding ? <CircularProgress size={20} /> : 'Laden'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

**Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzVehicleTab.tsx
git commit -m "feat(kostenersatz): add vehicle admin tab component"
```

---

## Task 6: Restructure Admin Settings into Tabs

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzAdminSettings.tsx`

**Step 1: Add tab imports and vehicle tab import**

Add to imports at top:

```typescript
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import KostenersatzVehicleTab from './KostenersatzVehicleTab';
```

**Step 2: Add tab state inside the component**

Add after the existing state declarations (around line 70):

```typescript
const [activeTab, setActiveTab] = useState(0);
```

**Step 3: Replace the return JSX**

Replace the entire return statement starting at line 326 with a tabbed structure. The return should wrap the existing content in tabs:

```typescript
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h5">Kostenersatz Einstellungen</Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Tarife" />
          <Tab label="Fahrzeuge" />
          <Tab label="Vorlagen" />
          <Tab label="E-Mail" />
        </Tabs>
      </Box>

      {/* Tab 0: Tarife (Versions + Rates) */}
      {activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Versions Section - existing Card */}
          <Card>
            {/* ... existing versions content ... */}
          </Card>

          {/* Rates Overview - existing Card */}
          <Card>
            {/* ... existing rates content ... */}
          </Card>
        </Box>
      )}

      {/* Tab 1: Fahrzeuge */}
      {activeTab === 1 && (
        <KostenersatzVehicleTab rates={rates} />
      )}

      {/* Tab 2: Vorlagen */}
      {activeTab === 2 && (
        <Card>
          {/* ... existing templates content ... */}
        </Card>
      )}

      {/* Tab 3: E-Mail */}
      {activeTab === 3 && (
        <Card>
          {/* ... existing email content ... */}
        </Card>
      )}

      {/* Dialogs remain outside tabs */}
      {/* Seed Dialog */}
      {/* Template Edit Dialog */}
      {/* Rate Edit Dialog */}
      {/* Custom Item Dialog */}
    </Box>
  );
```

This is a structural change - extract each existing Card into its respective tab panel. The dialogs stay at the bottom, outside the tabs.

**Step 4: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Test manually**

Run: `npm run dev`
Navigate to `/admin/kostenersatz` and verify:
- Four tabs are visible
- Each tab shows the correct content
- Dialogs still work

**Step 6: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzAdminSettings.tsx
git commit -m "refactor(kostenersatz): restructure admin settings into tabs"
```

---

## Task 7: Create Vehicle Quick-Add Panel Component

**Files:**
- Create: `src/components/Kostenersatz/VehicleQuickAddPanel.tsx`

**Step 1: Create the quick-add panel**

```typescript
'use client';

import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { KostenersatzVehicle } from '../../common/kostenersatz';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';

interface VehicleQuickAddPanelProps {
  selectedVehicleIds: string[];
  onToggleVehicle: (vehicle: KostenersatzVehicle) => void;
  disabled?: boolean;
}

export default function VehicleQuickAddPanel({
  selectedVehicleIds,
  onToggleVehicle,
  disabled = false,
}: VehicleQuickAddPanelProps) {
  const { vehicles, loading } = useKostenersatzVehicles();

  if (loading || vehicles.length === 0) {
    return null;
  }

  const selectedSet = new Set(selectedVehicleIds);

  return (
    <Accordion defaultExpanded sx={{ mb: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalShippingIcon color="action" />
          <Typography variant="subtitle1" fontWeight={500}>
            Unsere Fahrzeuge
          </Typography>
          {selectedVehicleIds.length > 0 && (
            <Chip
              label={selectedVehicleIds.length}
              size="small"
              color="primary"
            />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {vehicles.map((vehicle) => {
            const isSelected = selectedSet.has(vehicle.id);
            return (
              <Chip
                key={vehicle.id}
                label={vehicle.name}
                onClick={() => onToggleVehicle(vehicle)}
                color={isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
                disabled={disabled}
                title={vehicle.description || vehicle.name}
              />
            );
          })}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
```

**Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Kostenersatz/VehicleQuickAddPanel.tsx
git commit -m "feat(kostenersatz): add vehicle quick-add panel component"
```

---

## Task 8: Integrate Vehicle Panel into Calculation Tab

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzBerechnungTab.tsx`

**Step 1: Add import for VehicleQuickAddPanel**

Add to imports:

```typescript
import VehicleQuickAddPanel from './VehicleQuickAddPanel';
import { KostenersatzVehicle } from '../../common/kostenersatz';
```

**Step 2: Update the props interface**

Add new props to `KostenersatzBerechnungTabProps` (around line 22):

```typescript
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
  onVehicleToggle?: (vehicle: KostenersatzVehicle) => void;
  selectedVehicleIds?: string[];
  disabled?: boolean;
}
```

**Step 3: Update the component signature**

Add the new props to destructuring:

```typescript
export default function KostenersatzBerechnungTab({
  calculation,
  rates,
  ratesById,
  onItemChange,
  onCustomItemChange,
  onVehicleToggle,
  selectedVehicleIds = [],
  disabled = false,
}: KostenersatzBerechnungTabProps) {
```

**Step 4: Add VehicleQuickAddPanel to JSX**

Add at the beginning of the return statement, before the categories map (around line 102):

```typescript
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Vehicle Quick-Add Panel */}
      {onVehicleToggle && (
        <VehicleQuickAddPanel
          selectedVehicleIds={selectedVehicleIds}
          onToggleVehicle={onVehicleToggle}
          disabled={disabled}
        />
      )}

      {/* Category accordions */}
      {categories.map((category, idx) => {
        // ... existing code
```

**Step 5: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzBerechnungTab.tsx
git commit -m "feat(kostenersatz): integrate vehicle quick-add panel into calculation tab"
```

---

## Task 9: Wire Up Vehicle Toggle in Calculation Page

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzCalculationPage.tsx`

**Step 1: Read the current file to understand its structure**

The calculation page manages the calculation state. We need to:
1. Track selected vehicle IDs
2. Handle vehicle toggle (add/remove line items)
3. Pass props to KostenersatzBerechnungTab

**Step 2: Add vehicle state and handlers**

Add imports:

```typescript
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
import { KostenersatzVehicle, createLineItem } from '../../common/kostenersatz';
```

Add state for selected vehicles (derive from calculation.vehicles or items):

```typescript
// Derive selected vehicle IDs from calculation
const selectedVehicleIds = useMemo(() => {
  return calculation?.vehicles || [];
}, [calculation?.vehicles]);
```

Add vehicle toggle handler:

```typescript
const handleVehicleToggle = useCallback((vehicle: KostenersatzVehicle) => {
  if (!calculation) return;

  const isSelected = selectedVehicleIds.includes(vehicle.id);
  const rate = ratesById.get(vehicle.rateId);

  if (!rate) {
    console.warn(`Rate ${vehicle.rateId} not found for vehicle ${vehicle.id}`);
    return;
  }

  if (isSelected) {
    // Remove vehicle: remove from vehicles array and remove line item
    const newVehicles = selectedVehicleIds.filter((id) => id !== vehicle.id);
    const newItems = calculation.items.filter((item) => item.rateId !== vehicle.rateId);

    setCalculation({
      ...calculation,
      vehicles: newVehicles,
      items: newItems,
    });
  } else {
    // Add vehicle: add to vehicles array and add line item
    const newVehicles = [...selectedVehicleIds, vehicle.id];
    const newItem = createLineItem(
      vehicle.rateId,
      1, // einheiten
      calculation.defaultStunden,
      rate,
      calculation.defaultStunden
    );

    // Check if rate already exists (multiple vehicles can map to same rate)
    const existingItemIndex = calculation.items.findIndex((item) => item.rateId === vehicle.rateId);

    let newItems;
    if (existingItemIndex >= 0) {
      // Increment existing item
      newItems = calculation.items.map((item, idx) =>
        idx === existingItemIndex
          ? { ...item, einheiten: item.einheiten + 1 }
          : item
      );
    } else {
      // Add new item
      newItems = [...calculation.items, newItem];
    }

    setCalculation({
      ...calculation,
      vehicles: newVehicles,
      items: newItems,
    });
  }
}, [calculation, selectedVehicleIds, ratesById]);
```

**Step 3: Pass props to KostenersatzBerechnungTab**

Update the JSX where `KostenersatzBerechnungTab` is rendered:

```typescript
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
```

**Step 4: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Test manually**

Run: `npm run dev`
- Create a new Kostenersatz calculation
- Toggle vehicles in the panel
- Verify items are added/removed
- Verify the panel reflects selection state

**Step 6: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzCalculationPage.tsx
git commit -m "feat(kostenersatz): wire up vehicle toggle in calculation page"
```

---

## Task 10: Update Template Dialog to Show Vehicles

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzTemplateDialog.tsx`

**Step 1: Add vehicle-related imports and props**

Add imports:

```typescript
import Chip from '@mui/material/Chip';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
```

Update props interface:

```typescript
export interface KostenersatzTemplateDialogProps {
  open: boolean;
  onClose: (saved?: boolean) => void;
  existingTemplate?: KostenersatzTemplate;
  calculationItems?: KostenersatzLineItem[];
  calculationDefaultStunden?: number;
  calculationVehicles?: string[]; // NEW
  isAdmin?: boolean;
  rates?: KostenersatzRate[];
}
```

**Step 2: Add vehicles to component**

Add to component:

```typescript
const { vehiclesById } = useKostenersatzVehicles();
const [editedVehicles, setEditedVehicles] = useState<string[]>([]);

// Initialize vehicles in useEffect
useEffect(() => {
  if (open) {
    // ... existing code ...
    if (calculationVehicles) {
      setEditedVehicles([...calculationVehicles]);
    } else if (existingTemplate?.vehicles) {
      setEditedVehicles([...existingTemplate.vehicles]);
    } else {
      setEditedVehicles([]);
    }
  }
}, [open, existingTemplate, calculationItems, calculationVehicles]);
```

**Step 3: Save vehicles with template**

Update `handleSave` to include vehicles:

```typescript
const handleSave = async () => {
  // ... existing validation ...

  if (existingTemplate?.id) {
    await updateTemplate({
      ...existingTemplate,
      name: name.trim(),
      description: trimmedDescription || '',
      isShared,
      items: editedItems,
      vehicles: editedVehicles, // NEW
    });
  } else {
    await addTemplate({
      name: name.trim(),
      ...(trimmedDescription && { description: trimmedDescription }),
      isShared,
      items: editedItems,
      defaultStunden: defaultStundenToSave,
      vehicles: editedVehicles, // NEW
    });
  }
  // ... rest of function ...
};
```

**Step 4: Display vehicles in dialog**

Add after the items list section:

```typescript
{/* Show vehicles when editing existing template */}
{editedVehicles.length > 0 && (
  <Box>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>
      Fahrzeuge ({editedVehicles.length})
    </Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {editedVehicles.map((vehicleId) => {
        const vehicle = vehiclesById.get(vehicleId);
        return (
          <Chip
            key={vehicleId}
            label={vehicle?.name || vehicleId}
            size="small"
            variant="outlined"
          />
        );
      })}
    </Box>
  </Box>
)}
```

**Step 5: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzTemplateDialog.tsx
git commit -m "feat(kostenersatz): add vehicle display and saving to template dialog"
```

---

## Task 11: Update Template Loading to Restore Vehicles

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzCalculationPage.tsx`

**Step 1: Update template application logic**

Find the function that handles template selection (likely `handleApplyTemplate` or similar) and update it to:

1. Set vehicles from template
2. Add line items for each vehicle

```typescript
const handleApplyTemplate = useCallback((template: KostenersatzTemplate) => {
  if (!calculation) return;

  // Get vehicle line items
  const vehicleLineItems: KostenersatzLineItem[] = [];
  const templateVehicles = template.vehicles || [];

  for (const vehicleId of templateVehicles) {
    const vehicle = vehiclesById.get(vehicleId);
    if (vehicle) {
      const rate = ratesById.get(vehicle.rateId);
      if (rate) {
        const existingVehicleItem = vehicleLineItems.find(
          (item) => item.rateId === vehicle.rateId
        );
        if (existingVehicleItem) {
          existingVehicleItem.einheiten += 1;
        } else {
          vehicleLineItems.push(
            createLineItem(
              vehicle.rateId,
              1,
              template.defaultStunden || calculation.defaultStunden,
              rate,
              template.defaultStunden || calculation.defaultStunden
            )
          );
        }
      }
    }
  }

  // Combine vehicle items with template items (avoiding duplicates)
  const templateItems = template.items.map((item) => {
    const rate = ratesById.get(item.rateId);
    if (!rate) return null;
    return createLineItem(
      item.rateId,
      item.einheiten,
      template.defaultStunden || calculation.defaultStunden,
      rate,
      template.defaultStunden || calculation.defaultStunden
    );
  }).filter(Boolean) as KostenersatzLineItem[];

  // Merge: vehicle items first, then non-vehicle template items
  const vehicleRateIds = new Set(vehicleLineItems.map((item) => item.rateId));
  const nonVehicleItems = templateItems.filter(
    (item) => !vehicleRateIds.has(item.rateId)
  );

  setCalculation({
    ...calculation,
    vehicles: templateVehicles,
    items: [...vehicleLineItems, ...nonVehicleItems],
    defaultStunden: template.defaultStunden || calculation.defaultStunden,
  });
}, [calculation, vehiclesById, ratesById]);
```

**Step 2: Add vehiclesById from hook**

Make sure to use the vehicles hook:

```typescript
const { vehiclesById } = useKostenersatzVehicles();
```

**Step 3: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Test manually**

Run: `npm run dev`
- Create a calculation with vehicles selected
- Save as template
- Create new calculation
- Load the template
- Verify vehicles are selected in panel

**Step 5: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzCalculationPage.tsx
git commit -m "feat(kostenersatz): restore vehicles when loading template"
```

---

## Task 12: Pass Vehicles to Template Dialog When Saving

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzCalculationPage.tsx`

**Step 1: Update template dialog invocation**

Find where `KostenersatzTemplateDialog` is rendered and add the vehicles prop:

```typescript
<KostenersatzTemplateDialog
  open={templateDialogOpen}
  onClose={handleTemplateDialogClose}
  calculationItems={calculation?.items}
  calculationDefaultStunden={calculation?.defaultStunden}
  calculationVehicles={calculation?.vehicles} // NEW
  isAdmin={isAdmin}
  rates={rates}
/>
```

**Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Test end-to-end**

Run: `npm run dev`
1. Go to Kostenersatz admin → Fahrzeuge tab
2. Click "Standard-Fahrzeuge laden" to seed vehicles
3. Create new calculation
4. Select some vehicles from the panel
5. Add other items
6. Save as template
7. Create new calculation
8. Load the template
9. Verify vehicles are selected and items are correct

**Step 4: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzCalculationPage.tsx
git commit -m "feat(kostenersatz): pass vehicles to template dialog when saving"
```

---

## Task 13: Final Verification and Cleanup

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 2: Run linter**

Run: `npm run lint`
Expected: No lint errors

**Step 3: Test complete flow**

1. Admin: Seed vehicles
2. Admin: Add/edit/delete a vehicle
3. User: Create calculation with vehicle selection
4. User: Save as template
5. User: Load template in new calculation
6. Verify all functionality works

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(kostenersatz): complete vehicle selection feature"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add vehicle types and constants |
| 2 | Add default vehicles array |
| 3 | Create vehicle hooks |
| 4 | Add vehicle mutations |
| 5 | Create vehicle admin tab |
| 6 | Restructure admin into tabs |
| 7 | Create quick-add panel |
| 8 | Integrate panel into calculation tab |
| 9 | Wire up vehicle toggle logic |
| 10 | Update template dialog for vehicles |
| 11 | Update template loading for vehicles |
| 12 | Pass vehicles when saving template |
| 13 | Final verification |
