# Marker Data Fields & Heatmap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-defined data fields to layers/markers with heatmap visualization for measurement data.

**Architecture:** Layer-level schema (`dataSchema`) defines fields; item-level `fieldData` stores values as native Firestore objects. Heatmap config on layers drives marker coloring and a Leaflet heat overlay. KML import auto-generates schemas.

**Tech Stack:** Next.js 16, React 19, TypeScript, MUI, Leaflet, React Leaflet, Firebase Firestore, leaflet.heat

**Spec:** `docs/superpowers/specs/2026-03-11-marker-data-fields-heatmap-design.md`

**Working directory:** `.worktrees/feature-marker-data-fields/`

---

## Chunk 1: Data Model & Core Plumbing

### Task 1: Add type definitions to Firestore types

**Files:**

- Modify: `src/components/firebase/firestore.ts`

- [ ] **Step 1: Add DataSchemaField and HeatmapConfig interfaces**

Add before the `FirecallLayer` interface (around line 52):

```typescript
export interface DataSchemaField {
  key: string;
  label: string;
  unit: string;
  type: 'number' | 'text' | 'boolean';
  defaultValue?: string | number | boolean;
}

export interface HeatmapConfig {
  enabled: boolean;
  activeKey: string;
  colorMode: 'auto' | 'manual';
  min?: number;
  max?: number;
  colorStops?: { value: number; color: string }[];
}
```

- [ ] **Step 2: Add dataSchema and heatmapConfig to FirecallLayer**

In the `FirecallLayer` interface (line 54-59), add:

```typescript
dataSchema?: DataSchemaField[];
heatmapConfig?: HeatmapConfig;
```

- [ ] **Step 3: Add fieldData to FirecallItem**

In the `FirecallItem` interface (line 24-50), add:

```typescript
fieldData?: Record<string, string | number | boolean>;
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add DataSchemaField, HeatmapConfig types and fieldData to FirecallItem"
```

---

### Task 2: Wire fieldData into FirecallItemBase

**Files:**

- Modify: `src/components/FirecallItems/elements/FirecallItemBase.tsx`

- [ ] **Step 1: Add fieldData to constructor**

In the constructor (lines 78-100), add `fieldData` to the destructured parameters and assign it:

```typescript
// Add to destructured params:
fieldData,

// Add to assignments:
this.fieldData = fieldData || {};
```

- [ ] **Step 2: Add fieldData instance property**

Add alongside other properties (around line 67):

```typescript
fieldData: Record<string, string | number | boolean>;
```

- [ ] **Step 3: Add fieldData to data() method**

In the `data()` method (lines 136-153), add `fieldData: this.fieldData` to the returned object. Only include it if non-empty:

```typescript
...(Object.keys(this.fieldData).length > 0 ? { fieldData: this.fieldData } : {}),
```

- [ ] **Step 4: Fix filteredData() to preserve false, 0, and fieldData objects**

In `filteredData()` (lines 155-159), the current filter is `.filter(([key, value]) => value)` which drops `false`, `0`, and empty objects. Replace:

```typescript
// Old (line 157):
Object.entries(this.data()).filter(([key, value]) => value)

// New:
Object.entries(this.data()).filter(([key, value]) => value !== undefined && value !== null && value !== '')
```

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallItemBase.tsx
git commit -m "feat: add fieldData to FirecallItemBase and fix filteredData() falsy handling"
```

---

### Task 3: Wire dataSchema and heatmapConfig into FirecallItemLayer

**Files:**

- Modify: `src/components/FirecallItems/elements/FirecallItemLayer.tsx`

- [ ] **Step 1: Add properties to constructor**

In the constructor (lines 12-27), add to destructured params and assignments:

```typescript
// Destructured params:
dataSchema,
heatmapConfig,

// Assignments:
this.dataSchema = dataSchema || [];
this.heatmapConfig = heatmapConfig || undefined;
```

- [ ] **Step 2: Add instance properties**

Add alongside other properties:

```typescript
dataSchema: DataSchemaField[];
heatmapConfig?: HeatmapConfig;
```

Import `DataSchemaField` and `HeatmapConfig` from `../../firebase/firestore`.

- [ ] **Step 3: Add to data() method**

In the `data()` method (lines 87-94), add to the returned object:

```typescript
...(this.dataSchema.length > 0 ? { dataSchema: this.dataSchema } : {}),
...(this.heatmapConfig ? { heatmapConfig: this.heatmapConfig } : {}),
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallItemLayer.tsx
git commit -m "feat: add dataSchema and heatmapConfig to FirecallItemLayer"
```

---

### Task 4: Heatmap color utility

**Files:**

- Create: `src/common/heatmap.ts`

- [ ] **Step 1: Create the heatmap color utility**

```typescript
import { HeatmapConfig } from '../components/firebase/firestore';

/**
 * Interpolate between color stops. Colors are hex strings.
 */
function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const DEFAULT_COLOR_STOPS = [
  { value: 0, color: '#00ff00' },   // green (low)
  { value: 0.5, color: '#ffff00' }, // yellow (mid)
  { value: 1, color: '#ff0000' },   // red (high)
];

const NO_DATA_COLOR = '#999999';

/**
 * Get heatmap color for a value given config and all values in the layer.
 * Returns a hex color string.
 */
export function getHeatmapColor(
  value: number | undefined,
  config: HeatmapConfig,
  allValues: number[]
): string {
  if (value === undefined || value === null) {
    return NO_DATA_COLOR;
  }

  let min: number;
  let max: number;
  let stops: { value: number; color: string }[];

  if (config.colorMode === 'manual' && config.min !== undefined && config.max !== undefined && config.colorStops && config.colorStops.length >= 2) {
    min = config.min;
    max = config.max;
    stops = [...config.colorStops].sort((a, b) => a.value - b.value);
  } else {
    // Auto mode (or manual fallback)
    if (allValues.length === 0) return NO_DATA_COLOR;
    min = Math.min(...allValues);
    max = Math.max(...allValues);
    // All identical -> midpoint color (yellow)
    if (min === max) return '#ffff00';
    stops = DEFAULT_COLOR_STOPS.map((s) => ({
      value: min + s.value * (max - min),
      color: s.color,
    }));
  }

  if (max === min) return stops[0]?.color ?? NO_DATA_COLOR;

  // Clamp value
  const clamped = Math.max(min, Math.min(max, value));

  // Find surrounding stops
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].value && clamped <= stops[i + 1].value) {
      const range = stops[i + 1].value - stops[i].value;
      const t = range === 0 ? 0 : (clamped - stops[i].value) / range;
      return interpolateColor(stops[i].color, stops[i + 1].color, t);
    }
  }

  // Edge case: value at or beyond last stop
  return stops[stops.length - 1].color;
}

/**
 * Normalize a value to 0-1 range for heatmap overlay intensity.
 */
export function normalizeValue(
  value: number,
  config: HeatmapConfig,
  allValues: number[]
): number {
  let min: number;
  let max: number;

  if (config.colorMode === 'manual' && config.min !== undefined && config.max !== undefined) {
    min = config.min;
    max = config.max;
  } else {
    min = Math.min(...allValues);
    max = Math.max(...allValues);
  }

  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/common/heatmap.ts
git commit -m "feat: add heatmap color utility with auto/manual color scale support"
```

---

## Chunk 2: Layer Schema Editor UI

### Task 5: DataSchemaEditor component

**Files:**

- Create: `src/components/FirecallItems/DataSchemaEditor.tsx`

- [ ] **Step 1: Create the schema editor component**

This component renders the "Datenfelder" section for layer editing. It receives the current `dataSchema` array and an `onChange` callback.

```typescript
'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';
import { DataSchemaField } from '../firebase/firestore';

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[äöüß]/g, (c) =>
      c === 'ä' ? 'ae' : c === 'ö' ? 'oe' : c === 'ü' ? 'ue' : 'ss'
    )
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

interface DataSchemaEditorProps {
  dataSchema: DataSchemaField[];
  onChange: (schema: DataSchemaField[]) => void;
}

export default function DataSchemaEditor({
  dataSchema,
  onChange,
}: DataSchemaEditorProps) {
  const updateField = useCallback(
    (index: number, updates: Partial<DataSchemaField>) => {
      const updated = [...dataSchema];
      updated[index] = { ...updated[index], ...updates };
      // Auto-slugify key from label if key hasn't been manually edited
      if (updates.label && !updates.key) {
        const autoKey = slugify(updates.label);
        const existingKeys = updated
          .filter((_, i) => i !== index)
          .map((f) => f.key);
        if (!existingKeys.includes(autoKey)) {
          updated[index].key = autoKey;
        }
      }
      onChange(updated);
    },
    [dataSchema, onChange]
  );

  const addField = useCallback(() => {
    onChange([
      ...dataSchema,
      { key: '', label: '', unit: '', type: 'number' as const },
    ]);
  }, [dataSchema, onChange]);

  const removeField = useCallback(
    (index: number) => {
      onChange(dataSchema.filter((_, i) => i !== index));
    },
    [dataSchema, onChange]
  );

  const moveField = useCallback(
    (index: number, direction: -1 | 1) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= dataSchema.length) return;
      const updated = [...dataSchema];
      [updated[index], updated[newIndex]] = [
        updated[newIndex],
        updated[index],
      ];
      onChange(updated);
    },
    [dataSchema, onChange]
  );

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Datenfelder
      </Typography>
      {dataSchema.map((field, index) => (
        <Box
          key={index}
          sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}
        >
          <TextField
            label="Label"
            size="small"
            value={field.label}
            onChange={(e) => updateField(index, { label: e.target.value })}
            sx={{ flex: 2 }}
          />
          <TextField
            label="Key"
            size="small"
            value={field.key}
            onChange={(e) =>
              updateField(index, { key: e.target.value })
            }
            sx={{ flex: 1.5 }}
          />
          <TextField
            label="Einheit"
            size="small"
            value={field.unit}
            onChange={(e) => updateField(index, { unit: e.target.value })}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Typ"
            size="small"
            select
            value={field.type}
            onChange={(e) =>
              updateField(index, {
                type: e.target.value as DataSchemaField['type'],
              })
            }
            sx={{ flex: 1 }}
          >
            <MenuItem value="number">Zahl</MenuItem>
            <MenuItem value="text">Text</MenuItem>
            <MenuItem value="boolean">Ja/Nein</MenuItem>
          </TextField>
          {field.type === 'boolean' ? (
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!field.defaultValue}
                  onChange={(e) =>
                    updateField(index, { defaultValue: e.target.checked })
                  }
                />
              }
              label="Standard"
              sx={{ flex: 1 }}
            />
          ) : (
            <TextField
              label="Standard"
              size="small"
              type={field.type === 'number' ? 'number' : 'text'}
              value={field.defaultValue ?? ''}
              onChange={(e) =>
                updateField(index, {
                  defaultValue:
                    field.type === 'number'
                      ? (e.target.value !== '' ? parseFloat(e.target.value) : undefined)
                      : (e.target.value !== '' ? e.target.value : undefined),
                })
              }
              sx={{ flex: 1 }}
            />
          )}
          <IconButton
            size="small"
            onClick={() => moveField(index, -1)}
            disabled={index === 0}
          >
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => moveField(index, 1)}
            disabled={index === dataSchema.length - 1}
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => removeField(index)}
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button startIcon={<AddIcon />} onClick={addField} size="small">
        Feld hinzufügen
      </Button>
    </Box>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FirecallItems/DataSchemaEditor.tsx
git commit -m "feat: add DataSchemaEditor component for layer data field definitions"
```

---

### Task 6: HeatmapSettings component

**Files:**

- Create: `src/components/FirecallItems/HeatmapSettings.tsx`

- [ ] **Step 1: Create the heatmap settings component**

This renders the "Heatmap" section below the schema editor in the layer dialog.

```typescript
'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';
import { DataSchemaField, HeatmapConfig } from '../firebase/firestore';

interface HeatmapSettingsProps {
  config: HeatmapConfig | undefined;
  dataSchema: DataSchemaField[];
  onChange: (config: HeatmapConfig | undefined) => void;
}

const defaultConfig: HeatmapConfig = {
  enabled: false,
  activeKey: '',
  colorMode: 'auto',
};

export default function HeatmapSettings({
  config,
  dataSchema,
  onChange,
}: HeatmapSettingsProps) {
  const current = config || defaultConfig;
  const numericFields = dataSchema.filter((f) => f.type === 'number');

  const update = useCallback(
    (updates: Partial<HeatmapConfig>) => {
      onChange({ ...current, ...updates });
    },
    [current, onChange]
  );

  const addColorStop = useCallback(() => {
    const stops = current.colorStops || [];
    onChange({
      ...current,
      colorStops: [...stops, { value: 0, color: '#ff0000' }],
    });
  }, [current, onChange]);

  const updateColorStop = useCallback(
    (index: number, updates: Partial<{ value: number; color: string }>) => {
      const stops = [...(current.colorStops || [])];
      stops[index] = { ...stops[index], ...updates };
      onChange({ ...current, colorStops: stops });
    },
    [current, onChange]
  );

  const removeColorStop = useCallback(
    (index: number) => {
      const stops = (current.colorStops || []).filter((_, i) => i !== index);
      onChange({ ...current, colorStops: stops });
    },
    [current, onChange]
  );

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Heatmap
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={current.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
        }
        label="Heatmap-Färbung aktivieren"
      />
      {current.enabled && (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Aktives Feld"
            size="small"
            select
            value={current.activeKey}
            onChange={(e) => update({ activeKey: e.target.value })}
            fullWidth
          >
            {numericFields.map((f) => (
              <MenuItem key={f.key} value={f.key}>
                {f.label} ({f.unit})
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            value={current.colorMode}
            exclusive
            onChange={(_, val) => val && update({ colorMode: val })}
            size="small"
          >
            <ToggleButton value="auto">Auto</ToggleButton>
            <ToggleButton value="manual">Manuell</ToggleButton>
          </ToggleButtonGroup>
          {current.colorMode === 'manual' && (
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  label="Min"
                  type="number"
                  size="small"
                  value={current.min ?? ''}
                  onChange={(e) =>
                    update({ min: e.target.value !== '' ? parseFloat(e.target.value) : undefined })
                  }
                />
                <TextField
                  label="Max"
                  type="number"
                  size="small"
                  value={current.max ?? ''}
                  onChange={(e) =>
                    update({ max: e.target.value !== '' ? parseFloat(e.target.value) : undefined })
                  }
                />
              </Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Farbstops
              </Typography>
              {(current.colorStops || []).map((stop, index) => (
                <Box
                  key={index}
                  sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}
                >
                  <TextField
                    label="Wert"
                    type="number"
                    size="small"
                    value={stop.value}
                    onChange={(e) =>
                      updateColorStop(index, {
                        value: parseFloat(e.target.value) || 0,
                      })
                    }
                    sx={{ flex: 1 }}
                  />
                  <input
                    type="color"
                    value={stop.color}
                    onChange={(e) =>
                      updateColorStop(index, { color: e.target.value })
                    }
                    style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeColorStop(index)}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={addColorStop}
                size="small"
              >
                Farbstop hinzufügen
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FirecallItems/HeatmapSettings.tsx
git commit -m "feat: add HeatmapSettings component for layer heatmap configuration"
```

---

### Task 7: Integrate schema editor and heatmap settings into layer dialog

**Files:**

- Modify: `src/components/FirecallItems/FirecallItemDialog.tsx`

- [ ] **Step 1: Add schema editor and heatmap settings to dialog**

In `FirecallItemDialog.tsx`, add imports:

```typescript
import DataSchemaEditor from './DataSchemaEditor';
import HeatmapSettings from './HeatmapSettings';
import { DataSchemaField, HeatmapConfig } from '../firebase/firestore';
```

Inside the `DialogContent` section (after `FirecallItemFields`, around line 98), add a conditional section for layers:

```typescript
{item.type === 'layer' && (
  <>
    <DataSchemaEditor
      dataSchema={item.get<DataSchemaField[]>('dataSchema') || []}
      onChange={(schema: DataSchemaField[]) =>
        setItemField('dataSchema', schema)
      }
    />
    <HeatmapSettings
      config={item.get<HeatmapConfig>('heatmapConfig')}
      dataSchema={item.get<DataSchemaField[]>('dataSchema') || []}
      onChange={(config: HeatmapConfig | undefined) =>
        setItemField('heatmapConfig', config)
      }
    />
  </>
)}
```

**Important:** The dialog state is a `FirecallItemBase` class instance (line 42), not a plain object. Use `setItemField(field, value)` (line 51-53) which calls `prev.copy().set(field, value)` — this preserves prototype methods. The `item.get<T>(key)` method (line 273) provides typed access to dynamic properties. Never spread the class instance with `{ ...prev, ... }`.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FirecallItems/FirecallItemDialog.tsx
git commit -m "feat: integrate DataSchemaEditor and HeatmapSettings into layer dialog"
```

---

## Chunk 3: Item Data Entry UI

### Task 8: ItemDataFields component

**Files:**

- Create: `src/components/FirecallItems/ItemDataFields.tsx`

- [ ] **Step 1: Create the item data fields component**

This renders the "Daten" section in the marker dialog for items belonging to layers with dataSchema.

```typescript
'use client';

import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';
import { DataSchemaField } from '../firebase/firestore';

interface ItemDataFieldsProps {
  dataSchema: DataSchemaField[];
  fieldData: Record<string, string | number | boolean>;
  onChange: (fieldData: Record<string, string | number | boolean>) => void;
  isNew?: boolean;
}

export default function ItemDataFields({
  dataSchema,
  fieldData,
  onChange,
  isNew,
}: ItemDataFieldsProps) {
  const updateValue = useCallback(
    (key: string, value: string | number | boolean) => {
      onChange({ ...fieldData, [key]: value });
    },
    [fieldData, onChange]
  );

  if (dataSchema.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Daten
      </Typography>
      {dataSchema.map((field) => {
        const currentValue =
          fieldData[field.key] ??
          (isNew ? field.defaultValue : undefined) ??
          (field.type === 'boolean' ? false : field.type === 'number' ? '' : '');

        if (field.type === 'boolean') {
          return (
            <FormControlLabel
              key={field.key}
              control={
                <Checkbox
                  checked={!!currentValue}
                  onChange={(e) => updateValue(field.key, e.target.checked)}
                />
              }
              label={field.label}
            />
          );
        }

        const label = field.unit
          ? `${field.label} (${field.unit})`
          : field.label;

        return (
          <TextField
            key={field.key}
            label={label}
            type={field.type === 'number' ? 'number' : 'text'}
            size="small"
            fullWidth
            value={currentValue}
            onChange={(e) =>
              updateValue(
                field.key,
                field.type === 'number'
                  ? (e.target.value !== '' ? parseFloat(e.target.value) : undefined)
                  : e.target.value
              )
            }
            sx={{ mb: 1 }}
          />
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FirecallItems/ItemDataFields.tsx
git commit -m "feat: add ItemDataFields component for marker data entry"
```

---

### Task 9: Integrate ItemDataFields into the item dialog

**Files:**

- Modify: `src/components/FirecallItems/FirecallItemDialog.tsx`

- [ ] **Step 1: Add ItemDataFields to dialog for non-layer items**

Add import:

```typescript
import ItemDataFields from './ItemDataFields';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
```

Inside the component, get layers:

```typescript
const layers = useFirecallLayers();
```

After the `FirecallItemFields` section (and after the layer-specific section from Task 7), add:

```typescript
{item.type !== 'layer' && item.layer && layers[item.layer]?.dataSchema && (
  <ItemDataFields
    dataSchema={layers[item.layer].dataSchema!}
    fieldData={item.get<Record<string, string | number | boolean>>('fieldData') || {}}
    onChange={(fieldData) => setItemField('fieldData', fieldData)}
    isNew={!item.id}
  />
)}
```

**Important:** Use `setItemField('fieldData', fieldData)` — NOT `setItem((prev) => ({ ...prev, ... }))`. The state is a `FirecallItemBase` class instance. See Task 7 notes.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FirecallItems/FirecallItemDialog.tsx
git commit -m "feat: integrate ItemDataFields into marker edit dialog"
```

---

### Task 10: Display fieldData in marker popup

**Files:**

- Modify: `src/components/FirecallItems/elements/FirecallItemMarker.tsx`
- Modify: `src/components/FirecallItems/elements/FirecallItemBase.tsx`

The popup content is generated by `popupFn()` (overridden in `FirecallItemMarker.tsx` lines 83-115) and rendered inside `renderPopup()` → `FirecallItemPopup`. The item class instance has access to `this.fieldData` but NOT to the layer's `dataSchema` (it doesn't know field labels/units). Two approaches:

**Approach chosen:** Add a `dataSchema` property on `FirecallItemBase` that gets populated when the rendering pipeline has access to it. This is set in `FirecallItemsLayer` before rendering.

- [ ] **Step 1: Add dataSchema property to FirecallItemBase**

In `FirecallItemBase.tsx`, add a non-serialized property (NOT included in `data()`) for rendering context:

```typescript
// Instance property (around line 120):
_renderDataSchema?: DataSchemaField[];
```

Import `DataSchemaField` from the firestore types.

- [ ] **Step 2: Add formatFieldData method to FirecallItemBase**

```typescript
public formatFieldData(): string {
  if (!this.fieldData || Object.keys(this.fieldData).length === 0) return '';
  if (!this._renderDataSchema || this._renderDataSchema.length === 0) return '';

  return this._renderDataSchema
    .filter((f) => this.fieldData[f.key] !== undefined && this.fieldData[f.key] !== null)
    .map((f) => `${f.label}: ${this.fieldData[f.key]}${f.unit ? f.unit : ''}`)
    .join(' | ');
}
```

- [ ] **Step 3: Display fieldData in FirecallItemMarker.popupFn()**

In `FirecallItemMarker.tsx`, in the `popupFn()` method (around line 83-115), add after the existing content:

```typescript
{this.formatFieldData() && (
  <>
    <br />
    <Typography variant="caption">{this.formatFieldData()}</Typography>
  </>
)}
```

- [ ] **Step 4: Set _renderDataSchema in FirecallItemsLayer before rendering**

In `FirecallItemsLayer.tsx`, in the `renderMarker` function, set the schema on the item instance before rendering:

```typescript
function renderMarker(
  record: FirecallItem,
  setFirecallItem: (item: FirecallItem) => void,
  options?: MarkerRenderOptions
) {
  try {
    const instance = getItemInstance(record);
    instance._renderDataSchema = options?.dataSchema;
    return instance.renderMarker(setFirecallItem, options);
  } catch (err) {
    console.error('Failed to render item ', record, err);
  }
  return <></>;
}
```

This wires up the popup display end-to-end: `FirecallItemsLayer` sets the schema → `getItemInstance` creates the instance → `_renderDataSchema` is set → `popupFn()` calls `formatFieldData()` → popup shows `O2: 19.5% | CO: 12 ppm`.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallItemBase.tsx
git commit -m "feat: add formatFieldData helper for popup display"
```

---

## Chunk 4: Marker Coloring & Heatmap Rendering

### Task 11: Pass heatmap config through the rendering pipeline

**Files:**

- Modify: `src/components/Map/layers/FirecallItemsLayer.tsx`
- Modify: `src/components/FirecallItems/elements/FirecallItemBase.tsx`
- Modify: `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx`

The `FirecallItemsLayer` already receives `layer` as a prop (typed `FirecallLayer`, line 17). Once Task 3 adds `dataSchema` and `heatmapConfig` to `FirecallLayer`, the layer prop already carries these fields — no changes needed in `FirecallLayer.tsx`.

- [ ] **Step 1: Extend MarkerRenderOptions**

In `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx` (lines 18-23), extend `MarkerRenderOptions`:

```typescript
export interface MarkerRenderOptions {
  hidePopup?: boolean;
  disableClick?: boolean;
  heatmapColor?: string;    // override marker color for heatmap
  dataSchema?: DataSchemaField[];  // for popup display
}
```

Import `DataSchemaField` from `../../../firebase/firestore`.

- [ ] **Step 2: Compute heatmap colors in FirecallItemsLayer**

In `FirecallItemsLayer.tsx`, import heatmap utility and compute colors for all items. The key insight: compute `allValues` and per-item colors here, then pass the resolved color through `renderMarker()` options.

```typescript
import { getHeatmapColor } from '../../../common/heatmap';
import { DataSchemaField } from '../../firebase/firestore';

// Inside the component, after `records`:
const heatmapConfig = layer?.heatmapConfig;
const dataSchema = layer?.dataSchema;

const allValues = useMemo(() => {
  if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey) return [];
  return records
    .map((r) => r.fieldData?.[heatmapConfig.activeKey])
    .filter((v): v is number => typeof v === 'number');
}, [records, heatmapConfig]);
```

- [ ] **Step 3: Update the renderMarker function to pass options**

The standalone `renderMarker` function (lines 20-30) currently calls `getItemInstance(record).renderMarker(setFirecallItem)` with no options. Change it to accept and pass options:

```typescript
function renderMarker(
  record: FirecallItem,
  setFirecallItem: (item: FirecallItem) => void,
  options?: MarkerRenderOptions
) {
  try {
    return getItemInstance(record).renderMarker(setFirecallItem, options);
  } catch (err) {
    console.error('Failed to render item ', record, err);
  }
  return <></>;
}
```

Note: `renderMarker` on `FirecallItemBase` (line 254-271) already accepts `options: MarkerRenderOptions = {}` as a second parameter and passes it to `FirecallItemMarkerDefault`. No changes needed on `FirecallItemBase.renderMarker()`.

- [ ] **Step 4: Compute per-item color and pass in the render call**

In the JSX mapping (lines 63-74), compute and pass the heatmap color:

```typescript
{records.map((record) => {
  let heatmapColor: string | undefined;
  if (heatmapConfig?.enabled && heatmapConfig?.activeKey) {
    const value = record.fieldData?.[heatmapConfig.activeKey];
    heatmapColor = typeof value === 'number'
      ? getHeatmapColor(value, heatmapConfig, allValues)
      : '#999999';
  }
  return (
    <React.Fragment key={record.id}>
      <>{renderMarker(record, setFirecallItem, {
        heatmapColor,
        dataSchema,
      })}</>
    </React.Fragment>
  );
})}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Map/layers/FirecallLayer.tsx src/components/Map/layers/FirecallItemsLayer.tsx
git commit -m "feat: pass heatmap config through rendering pipeline to markers"
```

---

### Task 12: Override marker color based on heatmap

**Files:**

- Modify: `src/components/FirecallItems/elements/FirecallItemMarker.tsx`
- Modify: `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx`

- [ ] **Step 1: Add heatmapColor parameter to icon() in FirecallItemMarker**

In `FirecallItemMarker.tsx`, modify the `icon()` method signature (line 119) to accept an optional color override. The method already has three branches (zeichen, iconUrl, color-based). Only the color-based fallback branch (lines 135-140) needs the override:

```typescript
public icon(heatmapColor?: string): LeafletIcon<IconOptions> {
  if (this.zeichen && iconKeys[this.zeichen]?.url) {
    // ... unchanged (tactical symbols aren't color-overridden)
  }
  if (this.iconUrl) {
    // ... unchanged (custom icons aren't color-overridden)
  }
  // Color-based marker — use heatmap override if provided
  const color = heatmapColor || this.color;
  return L.icon({
    iconUrl: `/api/icons/marker?fill=${encodeURIComponent('' + color)}`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -25],
  });
}
```

Also update the base class signature in `FirecallItemBase.tsx` (line 238):

```typescript
public icon(_heatmapColor?: string): Icon<IconOptions> {
  return leafletIcons().fallback;
}
```

- [ ] **Step 2: Use heatmapColor from options in FirecallItemDefault**

In `FirecallItemDefault.tsx` (line 78), the icon is currently computed as `const icon = record.icon()`. Change to pass the heatmap color from options:

```typescript
const icon = record.icon(options?.heatmapColor);
```

Destructure `heatmapColor` from options (line 75):

```typescript
options: { hidePopup, disableClick, heatmapColor } = {},
```

This is simple because the color computation already happened in `FirecallItemsLayer` (Task 11). No `useMemo` or heatmap imports needed here.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallItemMarker.tsx src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx
git commit -m "feat: override marker icon color based on heatmap data values"
```

---

### Task 13: Heatmap legend component

**Files:**

- Create: `src/components/Map/HeatmapLegend.tsx`

- [ ] **Step 1: Create the legend component**

A Leaflet control-style component positioned on the map showing the color gradient, min/max values, and active field name.

```typescript
'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataSchemaField, HeatmapConfig } from '../firebase/firestore';

interface HeatmapLegendProps {
  config: HeatmapConfig;
  dataSchema: DataSchemaField[];
  allValues: number[];
}

export default function HeatmapLegend({
  config,
  dataSchema,
  allValues,
}: HeatmapLegendProps) {
  const field = dataSchema.find((f) => f.key === config.activeKey);
  if (!field) return null;

  let min: number;
  let max: number;

  if (
    config.colorMode === 'manual' &&
    config.min !== undefined &&
    config.max !== undefined
  ) {
    min = config.min;
    max = config.max;
  } else {
    if (allValues.length === 0) {
      return (
        <Box
          sx={{
            position: 'absolute',
            bottom: 30,
            right: 10,
            zIndex: 1000,
            bgcolor: 'background.paper',
            p: 1,
            borderRadius: 1,
            boxShadow: 2,
          }}
        >
          <Typography variant="caption">{field.label}: Keine Daten</Typography>
        </Box>
      );
    }
    min = Math.min(...allValues);
    max = Math.max(...allValues);
  }

  const gradient =
    config.colorMode === 'manual' && config.colorStops?.length
      ? config.colorStops
          .sort((a, b) => a.value - b.value)
          .map(
            (s) =>
              `${s.color} ${((s.value - min) / (max - min || 1)) * 100}%`
          )
          .join(', ')
      : '#00ff00 0%, #ffff00 50%, #ff0000 100%';

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 30,
        right: 10,
        zIndex: 1000,
        bgcolor: 'background.paper',
        p: 1,
        borderRadius: 1,
        boxShadow: 2,
        minWidth: 120,
      }}
    >
      <Typography variant="caption" display="block" gutterBottom>
        {field.label} ({field.unit})
      </Typography>
      <Box
        sx={{
          height: 12,
          borderRadius: 1,
          background: `linear-gradient(to right, ${gradient})`,
          mb: 0.5,
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption">
          {min}
          {field.unit}
        </Typography>
        <Typography variant="caption">
          {max}
          {field.unit}
        </Typography>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/HeatmapLegend.tsx
git commit -m "feat: add HeatmapLegend component for color scale display"
```

---

### Task 14: Integrate legend into FirecallLayer

**Files:**

- Modify: `src/components/Map/layers/FirecallLayer.tsx`

- [ ] **Step 1: Render HeatmapLegend when heatmap is active**

Import and render `HeatmapLegend` alongside each layer that has an enabled heatmap config. The legend needs the `allValues` array — either compute it here from the items context or pass it up from `FirecallItemsLayer`.

A practical approach: render the legend in `FirecallItemsLayer` since it already has access to the items and computed `allValues`. Add the legend rendering there, inside the layer group.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/layers/FirecallLayer.tsx src/components/Map/layers/FirecallItemsLayer.tsx
git commit -m "feat: render heatmap legend when heatmap coloring is active"
```

---

## Chunk 5: Heatmap Overlay

### Task 15: Install leaflet.heat and add type declarations

**Files:**

- Modify: `package.json`
- Create: `src/components/Map/leaflet-heat.d.ts`

- [ ] **Step 1: Install leaflet.heat**

Run: `npm install leaflet.heat`

- [ ] **Step 2: Create type declaration file**

Following the pattern of `src/components/firebase/mabox-togeojson.d.ts` (placed in `src/components/Map/` since it's map-related, not firebase-related):

```typescript
declare module 'leaflet.heat' {
  import * as L from 'leaflet';

  type HeatLatLngTuple = [number, number, number];

  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  function heatLayer(
    latlngs: HeatLatLngTuple[],
    options?: HeatLayerOptions
  ): L.Layer;

  export = heatLayer;
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/components/Map/leaflet-heat.d.ts
git commit -m "feat: install leaflet.heat and add TypeScript declarations"
```

---

### Task 16: HeatmapOverlay component

**Files:**

- Create: `src/components/Map/layers/HeatmapOverlay.tsx`

- [ ] **Step 1: Create the heatmap overlay component**

This wraps `leaflet.heat` as a React Leaflet component. It must be client-side only.

```typescript
'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { HeatmapConfig } from '../../firebase/firestore';
import { normalizeValue } from '../../../common/heatmap';

interface HeatmapOverlayProps {
  points: { lat: number; lng: number; value: number }[];
  config: HeatmapConfig;
  allValues: number[];
}

export default function HeatmapOverlay({
  points,
  config,
  allValues,
}: HeatmapOverlayProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // Clean up previous layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    // Dynamic import to avoid SSR issues
    let cancelled = false;
    import('leaflet.heat').then((heatLayer) => {
      if (cancelled) return;

      const data = points.map((p) => [
        p.lat,
        p.lng,
        normalizeValue(p.value, config, allValues),
      ] as [number, number, number]);

      const layer = heatLayer(data, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        max: 1,
      });

      layer.addTo(map);
      layerRef.current = layer;
    });

    // Cleanup: set cancelled flag and remove layer
    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, config, allValues]);

  return null;
}
```

The cleanup uses a `ref` to track the Leaflet layer and a `cancelled` flag to handle the async `import()`. The `useEffect` return function properly removes the layer from the map.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/layers/HeatmapOverlay.tsx
git commit -m "feat: add HeatmapOverlay component wrapping leaflet.heat"
```

---

### Task 17: Integrate heatmap overlay into FirecallLayer

**Files:**

- Modify: `src/components/Map/layers/FirecallLayer.tsx`

- [ ] **Step 1: Add heatmap overlay as toggleable LayersControl entry**

For each layer with `heatmapConfig.enabled`, add a second `LayersControl.Overlay` entry named `"{Layer name} Heatmap"` that renders the `HeatmapOverlay` component.

The overlay receives points extracted from the layer's items (filtered to those with numeric values for the active key).

Since `FirecallLayer.tsx` doesn't directly have item data, the heatmap overlay should be rendered from `FirecallItemsLayer.tsx` which has the items. Add it there alongside the existing marker rendering, wrapped in a `LayersControl.Overlay`.

- [ ] **Step 2: Run lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/layers/FirecallLayer.tsx src/components/Map/layers/FirecallItemsLayer.tsx
git commit -m "feat: integrate heatmap overlay as toggleable map layer"
```

---

## Chunk 6: KML Import

### Task 18: Adjust KML import to auto-generate schema and use fieldData

**Files:**

- Modify: `src/components/firebase/KmlImport.tsx`

- [ ] **Step 1: Add schema inference logic**

Add a helper function before `parseGeoJson`:

```typescript
const KML_STYLE_PROPERTIES = new Set([
  'styleurl', 'stylehash', 'stroke', 'stroke-opacity', 'stroke-width',
  'fill', 'fill-opacity', 'visibility', 'icon',
]);

function inferType(value: any): DataSchemaField['type'] {
  if (typeof value === 'boolean' || value === 'true' || value === 'false') return 'boolean';
  if (typeof value === 'number' || (typeof value === 'string' && value !== '' && !isNaN(Number(value)))) return 'number';
  return 'text';
}

function coerceValue(value: any, type: DataSchemaField['type']): string | number | boolean {
  if (type === 'boolean') return value === true || value === 'true';
  if (type === 'number') return typeof value === 'number' ? value : parseFloat(value) || 0;
  return String(value);
}

function generateSchemaFromFeatures(
  features: GeoJsonFeatureColleaction['features']
): DataSchemaField[] {
  const fieldMap = new Map<string, Set<DataSchemaField['type']>>();

  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties)) {
      if (KML_STYLE_PROPERTIES.has(key.toLowerCase())) continue;
      if (value === undefined || value === null) continue;
      if (!fieldMap.has(key)) fieldMap.set(key, new Set());
      fieldMap.get(key)!.add(inferType(value));
    }
  }

  return Array.from(fieldMap.entries()).map(([key, types]) => ({
    key,
    label: key,
    unit: '',
    type: types.size === 1 ? types.values().next().value! : 'text',
  }));
}
```

Import `DataSchemaField` from `./firestore`.

- [ ] **Step 2: Update parseGeoJson to populate fieldData**

Replace the `beschreibung` population (lines 74-80) with fieldData assignment:

```typescript
// Old:
beschreibung: Object.entries(f.properties)
  .filter(([k, v]) => ['styleurl', 'stylehash', 'name'].indexOf(k.toLowerCase()) < 0)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n'),

// New: (beschreibung removed, fieldData added)
```

Add a `schema` parameter to `parseGeoJson` and use it to populate `fieldData`:

```typescript
function parseGeoJson(geojson: GeoJsonFeatureColleaction, schema: DataSchemaField[]): FirecallItem[] {
  return geojson.features.map((f) => {
    // ... existing lat/lng/name logic ...

    const fieldData: Record<string, string | number | boolean> = {};
    for (const field of schema) {
      const value = f.properties[field.key];
      if (value !== undefined && value !== null) {
        fieldData[field.key] = coerceValue(value, field.type);
      }
    }

    const item: FirecallItem = {
      type: 'marker',
      name: `${f.properties.name}`,
      datum: new Date(
        f.properties['Time Stamp'] ?? f.properties['timestamp'] ?? new Date().toISOString()
      ).toISOString(),
      lat: latlng.lat,
      lng: latlng.lng,
      alt: latlng.alt,
      fieldData,
    };

    // ... rest of geometry handling (lines, polygons) ...
  });
}
```

- [ ] **Step 3: Update handleUpload to pass schema to layer creation**

In `handleUpload` (around lines 156-163), pass the auto-generated schema when creating the layer:

```typescript
const schema = generateSchemaFromFeatures(geoJson.features);

const layer = await addFirecallItem({
  name: `KML Import ${formatTimestamp(new Date())}`,
  type: 'layer',
  dataSchema: schema,
} as FirecallItem);

const fcItems = parseGeoJson(geoJson, schema);
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/firebase/KmlImport.tsx
git commit -m "feat: KML import auto-generates data schema and stores values in fieldData"
```

---

## Chunk 7: Final Integration & Verification

### Task 19: Build and lint verification

**Files:** None (verification only)

- [ ] **Step 1: Run full lint**

Run: `npm run lint`
Expected: PASS with no errors

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds. Fix any TypeScript errors.

- [ ] **Step 3: Reset next-env.d.ts if modified**

Per CLAUDE.md instructions:

```bash
git checkout -- next-env.d.ts
```

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build and lint issues"
```

---

### Task 20: Manual testing checklist

This task is for the developer to manually verify in the browser:

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test layer schema editor**

1. Navigate to an existing firecall's layers page
2. Create a new layer
3. Edit the layer — verify "Datenfelder" section appears
4. Add fields: O2 (number, unit: %), CO (number, unit: ppm), Notes (text)
5. Save — verify fields persist when re-editing the layer

- [ ] **Step 3: Test marker data entry**

1. Add a marker to the layer created above
2. Edit the marker — verify "Daten" section appears with O2, CO, Notes fields
3. Enter values and save
4. Re-edit — verify values persist
5. Check the marker popup on the map shows the data values

- [ ] **Step 4: Test heatmap coloring**

1. Edit the layer, enable heatmap, select O2 as active key
2. Save — verify marker colors change based on O2 values
3. Add multiple markers with different O2 values
4. Verify color gradient (green → yellow → red) matches values
5. Verify legend appears on the map

- [ ] **Step 5: Test heatmap overlay**

1. Verify heatmap overlay toggle appears in layer control
2. Toggle it on — verify radial gradient blobs appear
3. Toggle markers off, overlay on — verify overlay-only view works

- [ ] **Step 6: Test KML import**

1. Import a KML file with ExtendedData properties
2. Verify a new layer is created with auto-generated schema
3. Edit the layer — verify schema fields match KML properties
4. Edit an imported marker — verify fieldData values are populated
