# KML Import Preview UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a preview dialog to `KmlImport.tsx` so users can review per-type item counts, edit the field schema, and set the layer name before committing the import.

**Architecture:** Single-file refactor of `KmlImport.tsx`. Parse KML on file select → open a MUI Dialog → user edits state → confirm triggers existing item creation logic. Mirrors `CsvImport.tsx` pattern. No new files.

**Tech Stack:** React 19, TypeScript, MUI Dialog/TextField/Chip, existing `DataSchemaEditor` component, existing `generateSchemaFromFeatures` + `parseGeoJson` helpers in the same file.

---

### Task 1: Update `generateSchemaFromFeatures` to return `headerToSchemaKey`

Currently returns `DataSchemaField[]`. Needs to also return a `Map<string, string>` mapping the original KML property key to the initial schema key. This map is later used by the import step so that property lookups survive user edits to `field.key`.

**Files:**
- Modify: `src/components/firebase/KmlImport.tsx:70-90`

**Step 1: Change the return type and add the map**

Replace the function body:

```ts
function generateSchemaFromFeatures(
  features: GeoJsonFeatureColleaction['features']
): { schema: DataSchemaField[]; headerToSchemaKey: Map<string, string> } {
  const fieldMap = new Map<string, Set<DataSchemaField['type']>>();

  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties)) {
      if (KML_STYLE_PROPERTIES.has(key.toLowerCase())) continue;
      if (value === undefined || value === null) continue;
      if (!fieldMap.has(key)) fieldMap.set(key, new Set());
      fieldMap.get(key)!.add(inferType(value));
    }
  }

  const schema: DataSchemaField[] = Array.from(fieldMap.entries()).map(
    ([key, types]) => ({
      key,
      label: key,
      unit: '',
      type: types.size === 1 ? types.values().next().value! : 'text',
    })
  );

  const headerToSchemaKey = new Map<string, string>(
    schema.map((f) => [f.key, f.key])
  );

  return { schema, headerToSchemaKey };
}
```

**Step 2: Run lint to confirm no type errors**

```bash
cd .worktrees/feature/kml-import-preview && npm run lint 2>&1 | head -30
```

Expected: errors only in `KmlImport.tsx` (call sites not yet updated) — that's fine, we fix those in the next tasks.

**Step 3: Commit**

```bash
cd .worktrees/feature/kml-import-preview
git add src/components/firebase/KmlImport.tsx
git commit -m "refactor: generateSchemaFromFeatures returns headerToSchemaKey"
```

---

### Task 2: Update `parseGeoJson` to use `headerToSchemaKey`

Currently does `f.properties[field.key]` — breaks if the user renamed `field.key`. Switch to iterating via `headerToSchemaKey` (originalKey → schemaKey) so property lookup always uses the original KML property name.

**Files:**
- Modify: `src/components/firebase/KmlImport.tsx:92-172`

**Step 1: Add `headerToSchemaKey` parameter and update the lookup**

```ts
function parseGeoJson(
  geojson: GeoJsonFeatureColleaction,
  schema: DataSchemaField[],
  headerToSchemaKey: Map<string, string>
): FirecallItem[] {
  // Build reverse map: schemaKey → field (for type coercion)
  const schemaByKey = new Map(schema.map((f) => [f.key, f]));

  return geojson.features.map((f) => {
    const latlng = GeoPosition.fromGeoJsonPosition(
      f.geometry.type === 'Point'
        ? (f.geometry as Point).coordinates
        : (f.geometry as LineString).coordinates[0]
    );

    const fieldData: Record<string, string | number | boolean> = {};
    for (const [originalKey, schemaKey] of headerToSchemaKey.entries()) {
      const value = f.properties[originalKey];
      const field = schemaByKey.get(schemaKey);
      if (value !== undefined && value !== null && field) {
        fieldData[schemaKey] = coerceValue(value, field.type);
      }
    }

    const item: FirecallItem = {
      type: 'marker',
      name: `${f.properties.name}`,
      datum: new Date(
        f.properties['Time Stamp'] ??
          f.properties['timestamp'] ??
          new Date().toISOString()
      ).toISOString(),
      lat: latlng.lat,
      lng: latlng.lng,
      alt: latlng.alt,
      fieldData,
    };

    if (f.geometry.type === 'Point') {
      (item as FcMarker).color = f.properties.fill;
      (item as FcMarker).iconUrl = f.properties.icon;
    } else if (f.geometry.type === 'LineString') {
      item.type = 'line';
      const lineString = f.geometry as LineString;
      (item as Line).positions = JSON.stringify(
        lineString.coordinates.map((c) =>
          GeoPosition.fromGeoJsonPosition(c).toLatLngPosition()
        )
      );
      const dest = GeoPosition.fromGeoJsonPosition(
        lineString.coordinates[lineString.coordinates.length - 1]
      );
      (item as Line).destLat = dest.lat;
      (item as Line).destLng = dest.lng;
      (item as Line).opacity = f.properties['fill-opacity']
        ? Math.round(f.properties['fill-opacity'] * 100)
        : 50;
      (item as Line).color = f.properties.fill;
    } else if (f.geometry.type === 'Polygon') {
      const polygon = f.geometry as Polygon;
      item.type = 'area';
      (item as FirecallArea).positions = JSON.stringify(
        polygon.coordinates[0].map((c) =>
          GeoPosition.fromGeoJsonPosition(c).toLatLngPosition()
        )
      );
      const dest = GeoPosition.fromGeoJsonPosition(
        polygon.coordinates[0][polygon.coordinates[0].length - 1]
      );
      (item as Line).destLat = dest.lat;
      (item as Line).destLng = dest.lng;
      (item as Line).opacity = f.properties['fill-opacity']
        ? Math.round(f.properties['fill-opacity'] * 100)
        : 50;
      (item as Line).color = f.properties.fill;
    }

    return item;
  });
}
```

**Step 2: Run lint**

```bash
cd .worktrees/feature/kml-import-preview && npm run lint 2>&1 | head -30
```

Expected: remaining errors only in the `KmlImport` component (call sites) — fixed in Task 3.

**Step 3: Commit**

```bash
cd .worktrees/feature/kml-import-preview
git add src/components/firebase/KmlImport.tsx
git commit -m "refactor: parseGeoJson uses headerToSchemaKey for property lookup"
```

---

### Task 3: Add `KmlPreviewState` interface and `parseKmlFile` helper

Extract the parsing into a pure function that returns all the state the dialog needs. Mirrors `buildPreview()` in `CsvImport.tsx`.

**Files:**
- Modify: `src/components/firebase/KmlImport.tsx` (add after the `parseGeoJson` function, before the component)

**Step 1: Add the interface and helper**

```ts
interface KmlPreviewState {
  geoJson: GeoJsonFeatureColleaction;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  layerName: string;
}

function parseKmlFile(kmlText: string, fileName: string): KmlPreviewState {
  const geoJson = kmlToGeoJson(kmlText);
  const { schema, headerToSchemaKey } = generateSchemaFromFeatures(
    geoJson.features
  );
  const layerName = fileName.replace(/\.kml$/i, '');
  return { geoJson, schema, headerToSchemaKey, layerName };
}
```

**Step 2: Run lint**

```bash
cd .worktrees/feature/kml-import-preview && npm run lint 2>&1 | head -30
```

Expected: no new errors.

**Step 3: Commit**

```bash
cd .worktrees/feature/kml-import-preview
git add src/components/firebase/KmlImport.tsx
git commit -m "refactor: add KmlPreviewState and parseKmlFile helper"
```

---

### Task 4: Refactor `KmlImport` component — state + handlers

Replace the current single-file-loop `handleUpload` with `handleFileSelect` (opens dialog) and `handleImport` (runs on dialog confirm). Add MUI imports needed for the dialog.

**Files:**
- Modify: `src/components/firebase/KmlImport.tsx:1-22` (imports)
- Modify: `src/components/firebase/KmlImport.tsx:174-256` (component)

**Step 1: Add MUI imports**

Add to the import block at the top:

```ts
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import DataSchemaEditor from '../FirecallItems/DataSchemaEditor';
```

**Step 2: Replace the component body**

```ts
export default function KmlImport() {
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [preview, setPreview] = useState<KmlPreviewState | null>(null);
  const addFirecallItem = useFirecallItemAdd();

  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const kmlText = await readFileAsText(file);
    setPreview(parseKmlFile(kmlText, file.name));
  }, []);

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setPreview(null);
    setUploadInProgress(true);

    try {
      const { geoJson, schema, headerToSchemaKey, layerName } = preview;
      const fcItems = parseGeoJson(geoJson, schema, headerToSchemaKey);

      const layer = await addFirecallItem({
        name: layerName || `KML Import ${formatTimestamp(new Date())}`,
        type: 'layer',
        dataSchema: schema,
      } as FirecallItem);

      await Promise.allSettled(
        fcItems.map((i) => ({ ...i, layer: layer.id })).map(addFirecallItem)
      );
    } catch (err) {
      console.error('Failed to import KML', err);
    }

    setUploadInProgress(false);
  }, [preview, addFirecallItem]);

  // Compute per-type counts from features
  const typeCounts = preview
    ? preview.geoJson.features.reduce(
        (acc, f) => {
          const t = f.geometry.type;
          acc[t] = (acc[t] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    : {};

  const totalCount = Object.values(typeCounts).reduce((a, b) => a + b, 0);

  const TYPE_LABELS: Record<string, string> = {
    Point: 'Punkte',
    LineString: 'Linien',
    Polygon: 'Flächen',
  };

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={<CloudUploadIcon />}
      >
        KML importieren
        <VisuallyHiddenInput
          type="file"
          accept=".kml,text/xml,application/vnd.google-earth.kml+xml"
          onChange={(event) => {
            (async () => {
              if (event.target.files) {
                await handleFileSelect(event.target.files);
                event.target.value = '';
              }
            })();
          }}
        />
      </Button>
      {uploadInProgress && (
        <>
          <Typography component="span" sx={{ ml: 1 }}>
            Importiere...
          </Typography>
          <CircularProgress size={20} sx={{ ml: 1 }} />
        </>
      )}
      {preview && (
        <Dialog
          open
          onClose={() => setPreview(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>KML Import</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Ebenenname"
                size="small"
                fullWidth
                value={preview.layerName}
                onChange={(e) =>
                  setPreview({ ...preview, layerName: e.target.value })
                }
              />

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {Object.entries(typeCounts).map(([type, count]) => (
                  <Chip
                    key={type}
                    label={`${count} ${TYPE_LABELS[type] ?? type}`}
                    size="small"
                  />
                ))}
              </Box>

              <DataSchemaEditor
                dataSchema={preview.schema}
                onChange={(schema) => setPreview({ ...preview, schema })}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreview(null)}>Abbrechen</Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={totalCount === 0}
            >
              {totalCount} Objekte importieren
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
```

**Step 3: Run lint — expect clean**

```bash
cd .worktrees/feature/kml-import-preview && npm run lint 2>&1 | head -40
```

Expected: no errors.

**Step 4: Build to confirm no type errors**

```bash
cd .worktrees/feature/kml-import-preview && npm run build 2>&1 | tail -20
```

Expected: successful build.

**Step 5: Commit**

```bash
cd .worktrees/feature/kml-import-preview
git add src/components/firebase/KmlImport.tsx
git commit -m "feat: KML import preview dialog with per-type counts and schema editor"
```

---

## Manual Test Checklist

After the build succeeds, test in the browser:

1. Open a firecall → Layers panel → click "KML importieren"
2. Pick a `.kml` file with at least Points and one LineString or Polygon
3. **Verify:** Dialog opens with the filename (minus `.kml`) in the layer name field
4. **Verify:** Chips show correct per-type counts matching the KML content
5. **Verify:** DataSchemaEditor shows the custom properties from the KML
6. Edit a field label — confirm the label changes in the editor
7. Click "Importieren"
8. **Verify:** Layer appears in the map with the correct name
9. **Verify:** Items are created with the correct types (markers/lines/areas)
10. **Verify:** Custom field data is stored correctly on items
