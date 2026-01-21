# Sidebar Inline Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable inline editing of firecall items directly in the sidebar by clicking on the item card.

**Architecture:** Extract field rendering from `FirecallItemDialog` into a shared `FirecallItemFields` component. Modify `FirecallItemDisplay` in `MapSidebar.tsx` to support an edit mode that renders these fields inline. Keyboard shortcuts (Enter/Escape) control save/cancel.

**Tech Stack:** React, MUI (TextField, Select, Switch, Snackbar), TypeScript

---

### Task 1: Create FirecallItemFields Component

**Files:**
- Create: `src/components/FirecallItems/FirecallItemFields.tsx`

**Step 1: Create the component file with imports**

```typescript
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputLabel from '@mui/material/InputLabel';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { StorageReference } from 'firebase/storage';
import { MuiColorInput } from 'mui-color-input';
import Image from 'next/image';
import React, { useCallback } from 'react';
import { parseTimestamp } from '../../common/time-format';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import { NON_DISPLAYABLE_ITEMS } from '../firebase/firestore';
import MyDateTimePicker from '../inputs/DateTimePicker';
import FileDisplay from '../inputs/FileDisplay';
import FileUploader from '../inputs/FileUploader';
import { FirecallItemBase } from './elements/FirecallItemBase';
import { icons } from './elements/icons';

export interface FirecallItemFieldsProps {
  item: FirecallItemBase;
  setItemField: (field: string, value: any) => void;
  showLatLng?: boolean;
  showLayerSelect?: boolean;
}

export default function FirecallItemFields({
  item,
  setItemField,
  showLatLng = true,
  showLayerSelect = true,
}: FirecallItemFieldsProps) {
  const layers = useFirecallLayers();

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setItemField(field, event.target.value);
    };

  const fileUploadComplete = useCallback(
    (key: string, refs: StorageReference[]) => {
      console.info(`file upload complete for ${key}: ${refs.toString()}`);
      const oldValue = (item as any)[key] || [];
      setItemField(key, [...oldValue, ...refs.map((r) => r.toString())]);
    },
    [item, setItemField]
  );

  return (
    <>
      {/* Lat/Lng fields for existing displayable items */}
      {showLatLng && NON_DISPLAYABLE_ITEMS.indexOf(item.type) < 0 && item.id && (
        <>
          <TextField
            margin="dense"
            id="lat"
            label="Latitude"
            variant="standard"
            onChange={onChange('lat')}
            value={item.lat || ''}
            fullWidth
          />
          <TextField
            margin="dense"
            id="lng"
            label="Longitude"
            variant="standard"
            onChange={onChange('lng')}
            value={item.lng || ''}
            fullWidth
          />
        </>
      )}

      {/* Dynamic fields from item.fields() */}
      {Object.entries(item.fields()).map(([key, label]) => (
        <React.Fragment key={key}>
          {/* Date fields */}
          {item.dateFields().includes(key) && (
            <MyDateTimePicker
              label={label}
              value={
                (((item as any)[key] as string) &&
                  parseTimestamp((item as any)[key] as string)) ||
                null
              }
              setValue={(newValue) => {
                setItemField(key, newValue?.toISOString());
              }}
            />
          )}

          {/* Boolean fields */}
          {item.fieldTypes()[key] === 'boolean' && (
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={
                      (item as any)[key] === 'true' ||
                      (item as any)[key] === true
                    }
                    onChange={(event, checked) => {
                      setItemField(key, checked ? 'true' : 'false');
                    }}
                  />
                }
                label={label}
              />
            </FormGroup>
          )}

          {/* Taktisches Zeichen selector */}
          {item.fieldTypes()[key] === 'TaktischesZeichen' && (
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel htmlFor={`${key}-select`}>
                Taktisches Zeichen
              </InputLabel>
              <Select
                defaultValue=""
                id={`${key}-select`}
                label="Taktisches Zeichen"
                value={(item as any)[key] || ''}
                onChange={(event): void => {
                  setItemField(key, event.target.value as string);
                }}
              >
                <MenuItem value="">
                  <em>Kein taktisches Zeichen</em>
                </MenuItem>
                {Object.entries(icons).map(([group, groupEntries]) => [
                  <ListSubheader key={group}>
                    {group.replace(/_/g, ' ')}
                  </ListSubheader>,
                  ...Object.entries(groupEntries).map(([name, icon]) => (
                    <MenuItem value={name} key={name}>
                      <Image
                        src={icon.url}
                        alt={name}
                        width={24}
                        height={24}
                        style={{ marginRight: 12 }}
                      />
                      {name.replace(/_/g, ' ')}
                    </MenuItem>
                  )),
                ])}
              </Select>
            </FormControl>
          )}

          {/* Select fields */}
          {item.fieldTypes()[key] === 'select' && (
            <FormControl fullWidth variant="standard">
              <InputLabel id={`firecall-item-${key}-label`}>
                {label}
              </InputLabel>
              <Select
                labelId={`firecall-item-${key}-label`}
                id={`firecall-item-${key}`}
                value={item.get<string>(key) || ''}
                label={label}
                onChange={(event): void => {
                  setItemField(key, event.target.value as string);
                }}
              >
                {Object.entries(item.selectValues()[key] || {}).map(
                  ([k, l]) => (
                    <MenuItem key={k} value={k}>
                      {l}
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>
          )}

          {/* Attachment fields */}
          {item.fieldTypes()[key] === 'attachment' && (
            <>
              <FileUploader
                onFileUploadComplete={(ref) => fileUploadComplete(key, ref)}
              />
              {(item as any)[key] &&
                ((item as any)[key] as string[]).map((url) => (
                  <FileDisplay
                    key={url}
                    url={url}
                    edit
                    onDeleteCallback={() => {
                      setItemField(
                        key,
                        ((item as any)[key] as string[]).filter(
                          (u) => u !== url
                        )
                      );
                    }}
                  />
                ))}
            </>
          )}

          {/* Color picker */}
          {item.fieldTypes()[key] === 'color' && (
            <MuiColorInput
              value={(item as any)[key] || '#0000ff'}
              fallbackValue="#0000ff"
              format="hex8"
              onChange={(newValue) => setItemField(key, newValue)}
              isAlphaHidden={false}
              fullWidth
              id={key}
              label={label}
              style={{ marginTop: 12 }}
            />
          )}

          {/* Text/number/textarea fields (default) */}
          {!item.dateFields().includes(key) &&
            !['boolean', 'date', 'TaktischesZeichen', 'attachment', 'select', 'color'].includes(
              item.fieldTypes()[key]
            ) && (
              <TextField
                margin="dense"
                id={key}
                label={label}
                type={item.fieldTypes()[key] || 'text'}
                multiline={item.fieldTypes()[key] === 'textarea'}
                fullWidth
                variant="standard"
                onChange={onChange(key)}
                value={((item as any)[key] as string) || ''}
              />
            )}
        </React.Fragment>
      ))}

      {/* Layer selector */}
      {showLayerSelect && NON_DISPLAYABLE_ITEMS.indexOf(item.type) < 0 && (
        <FormControl fullWidth variant="standard">
          <InputLabel id="firecall-item-layer-label">Ebene</InputLabel>
          <Select
            labelId="firecall-item-layer-label"
            id="firecall-item-layer"
            value={item.layer || ''}
            label="Ebene"
            onChange={(event): void => {
              setItemField('layer', event.target.value as string);
            }}
          >
            <MenuItem key="">Einsatz</MenuItem>
            {Object.entries(layers)
              .filter(([key]) => key !== 'fallback')
              .map(([key, layer]) => (
                <MenuItem key={key} value={key}>
                  {layer.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
      )}
    </>
  );
}
```

**Step 2: Verify the file compiles**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map && npx tsc --noEmit src/components/FirecallItems/FirecallItemFields.tsx 2>&1 | head -20`
Expected: No errors (or only unrelated errors from other files)

**Step 3: Commit**

```bash
git add src/components/FirecallItems/FirecallItemFields.tsx
git commit -m "feat: add FirecallItemFields shared component for field rendering"
```

---

### Task 2: Refactor FirecallItemDialog to Use FirecallItemFields

**Files:**
- Modify: `src/components/FirecallItems/FirecallItemDialog.tsx`

**Step 1: Update imports and replace inline field rendering**

Replace the entire field rendering section (lines 112-315 approximately) with the shared component. The dialog should:
1. Import `FirecallItemFields`
2. Replace all the field rendering JSX with `<FirecallItemFields item={item} setItemField={setItemField} showLatLng={!!item.id} />`
3. Keep the type selector separate (only shown when `allowTypeChange` is true)

Update the file to:

```typescript
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import React, { useState } from 'react';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import { fcItemNames, getItemInstance } from './elements';
import { FirecallItemBase } from './elements/FirecallItemBase';
import FirecallItemFields from './FirecallItemFields';

export interface FirecallItemDialogOptions {
  onClose: (item?: FirecallItem) => void;
  item?: FirecallItem;
  allowTypeChange?: boolean;
  type?: string;
}

export default function FirecallItemDialog({
  onClose,
  item: itemDefault,
  allowTypeChange = true,
  type: itemType,
}: FirecallItemDialogOptions) {
  const [open, setOpen] = useState(true);
  const [item, setFirecallItem] = useState<FirecallItemBase>(
    getItemInstance({
      type: itemType,
      ...itemDefault,
      datum: itemDefault?.datum || new Date().toISOString(),
    } as FirecallItem)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setItemField = (field: string, value: any) => {
    setFirecallItem((prev) => prev.copy().set(field, value));
  };

  const handleChange = (event: SelectChangeEvent) => {
    setFirecallItem((prev) =>
      getItemInstance({ ...prev.data(), type: event.target.value })
    );
  };

  return (
    <>
      <Dialog open={open} onClose={() => onClose()}>
        <DialogTitle>
          {item.id ? (
            <>{item.markerName()} bearbeiten</>
          ) : (
            <>Neu: {item.markerName()} hinzufügen</>
          )}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{item.dialogText()}</DialogContentText>
          {allowTypeChange && (
            <FormControl fullWidth variant="standard">
              <InputLabel id="firecall-item-type-label">Element Typ</InputLabel>
              <Select
                labelId="firecall-item-type-label"
                id="firecall-item-type"
                value={item.type}
                label="Art"
                onChange={handleChange}
              >
                {Object.entries(fcItemNames)
                  .filter(([key]) => key !== 'fallback')
                  .map(([key, name]) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          <FirecallItemFields
            item={item}
            setItemField={setItemField}
            showLatLng={!!item.id}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            Abbrechen
          </Button>
          {item.id && (
            <Button
              onClick={() => {
                setConfirmDelete(true);
              }}
              color="error"
            >
              Löschen
            </Button>
          )}
          <Button
            color="primary"
            onClick={() => {
              setOpen(false);
              onClose(item.filteredData());
            }}
          >
            {item.id ? 'Aktualisieren' : 'Hinzufügen'}
          </Button>
        </DialogActions>
      </Dialog>
      {confirmDelete && (
        <ConfirmDialog
          title={`${item.title()} löschen`}
          text={`${item.title()} wirklich löschen?`}
          onConfirm={(result) => {
            setConfirmDelete(false);
            if (result) {
              setOpen(false);
              onClose({ ...item.filteredData(), deleted: true });
            }
          }}
        />
      )}
    </>
  );
}
```

**Step 2: Verify dialog still works**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/FirecallItems/FirecallItemDialog.tsx
git commit -m "refactor: use FirecallItemFields in FirecallItemDialog"
```

---

### Task 3: Add Inline Editing State to FirecallItemDisplay

**Files:**
- Modify: `src/components/Map/MapSidebar.tsx`

**Step 1: Add editing state and imports**

Add these imports at the top:
```typescript
import Snackbar from '@mui/material/Snackbar';
import { getItemInstance } from '../FirecallItems/elements';
import { FirecallItemBase } from '../FirecallItems/elements/FirecallItemBase';
import FirecallItemFields from '../FirecallItems/FirecallItemFields';
```

Add state variables inside `FirecallItemDisplay`:
```typescript
const [isEditing, setIsEditing] = React.useState(false);
const [editedItem, setEditedItem] = React.useState<FirecallItemBase | null>(null);
const [snackbarOpen, setSnackbarOpen] = React.useState(false);
```

**Step 2: Add setItemField helper**

```typescript
const setItemField = (field: string, value: any) => {
  setEditedItem((prev) => prev ? prev.copy().set(field, value) : null);
};
```

**Step 3: Add enter/exit edit mode handlers**

```typescript
const enterEditMode = () => {
  if (editable && item.editable !== false) {
    setEditedItem(getItemInstance(item.original || item));
    setIsEditing(true);
  }
};

const exitEditMode = (save: boolean) => {
  if (save && editedItem) {
    updateItem(editedItem.filteredData());
    selectFirecallItem(editedItem.filteredData());
    setSnackbarOpen(true);
  }
  setIsEditing(false);
  setEditedItem(null);
};
```

**Step 4: Add keyboard handler**

```typescript
const handleKeyDown = (event: React.KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    // Don't save on Enter in textarea fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    event.preventDefault();
    exitEditMode(true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    exitEditMode(false);
  }
};
```

**Step 5: Commit progress**

```bash
git add src/components/Map/MapSidebar.tsx
git commit -m "feat: add inline editing state to FirecallItemDisplay"
```

---

### Task 4: Implement Edit Mode UI in FirecallItemDisplay

**Files:**
- Modify: `src/components/Map/MapSidebar.tsx`

**Step 1: Update the Card to be clickable and show edit mode**

Replace the return statement of `FirecallItemDisplay` with:

```typescript
return (
  <>
    <Card
      variant="outlined"
      onClick={!isEditing ? enterEditMode : undefined}
      onKeyDown={isEditing ? handleKeyDown : undefined}
      sx={{
        cursor: !isEditing && editable && item.editable !== false ? 'pointer' : 'default',
        borderColor: isEditing ? 'primary.main' : undefined,
        '&:hover': !isEditing && editable && item.editable !== false ? {
          borderColor: 'primary.light',
        } : {},
      }}
    >
      <CardHeader
        avatar={
          <Box
            sx={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!isApiIcon && (
              <Image
                src={icon.options.iconUrl}
                alt={item.type || 'marker'}
                width={24}
                height={24}
              />
            )}
            {isApiIcon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={icon.options.iconUrl}
                alt={item.type || 'marker'}
                width={24}
              />
            )}
          </Box>
        }
        action={
          <Tooltip title="Schließen">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                if (isEditing) {
                  exitEditMode(false);
                }
                selectFirecallItem(undefined);
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
        title={isEditing && editedItem ? editedItem.title() : itemInstance.title()}
        titleTypographyProps={{ variant: 'subtitle1', noWrap: true }}
        subheader={itemInstance.markerName()}
        subheaderTypographyProps={{ variant: 'caption' }}
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ pt: 1, pb: 1 }}>
        {!isEditing && (
          <>
            {item.beschreibung && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {item.beschreibung}
              </Typography>
            )}
            {item.lat && item.lng && (
              <Typography variant="caption" color="text.secondary">
                {Number.parseFloat('' + item.lat).toFixed(5)},{' '}
                {Number.parseFloat('' + item.lng).toFixed(5)}
              </Typography>
            )}
          </>
        )}
        {isEditing && editedItem && (
          <Box onClick={(e) => e.stopPropagation()}>
            <FirecallItemFields
              item={editedItem}
              setItemField={setItemField}
              showLatLng={!!editedItem.id}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 2, textAlign: 'center' }}
            >
              Enter = Speichern · Escape = Abbrechen
            </Typography>
          </Box>
        )}
      </CardContent>
      {editable && item.editable !== false && !isEditing && (
        <CardActions sx={{ pt: 0 }}>
          <Tooltip title="Bearbeiten">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                enterEditMode();
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Löschen">
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </CardActions>
      )}
      {isEditing && (
        <CardActions sx={{ pt: 0 }}>
          <Tooltip title="Löschen">
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </CardActions>
      )}
      {displayUpdateDialog && (
        <FirecallItemUpdateDialog
          item={item.original || item}
          allowTypeChange={false}
          callback={(newItem) => {
            setDisplayUpdateDialog(false);
            if (newItem) {
              selectFirecallItem(newItem);
            }
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`${itemInstance.title()} löschen`}
          text={`${itemInstance.markerName()} "${itemInstance.title()}" wirklich löschen?`}
          onConfirm={(confirmed) => {
            setConfirmDelete(false);
            if (confirmed) {
              updateItem({ ...item, deleted: true });
              selectFirecallItem(undefined);
              if (isEditing) {
                setIsEditing(false);
                setEditedItem(null);
              }
            }
          }}
        />
      )}
    </Card>
    <Snackbar
      open={snackbarOpen}
      autoHideDuration={3000}
      onClose={() => setSnackbarOpen(false)}
      message="Gespeichert"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    />
  </>
);
```

**Step 2: Verify build**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Map/MapSidebar.tsx
git commit -m "feat: implement inline editing UI in sidebar"
```

---

### Task 5: Add Click-Outside Handler

**Files:**
- Modify: `src/components/Map/MapSidebar.tsx`

**Step 1: Add ref and click-outside effect**

Add a ref to the Card:
```typescript
const cardRef = React.useRef<HTMLDivElement>(null);
```

Add useEffect for click-outside detection:
```typescript
React.useEffect(() => {
  if (!isEditing) return;

  const handleClickOutside = (event: MouseEvent) => {
    if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
      exitEditMode(false);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, [isEditing]);
```

Add ref to Card element:
```typescript
<Card
  ref={cardRef}
  variant="outlined"
  // ... rest of props
>
```

**Step 2: Verify build**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Map/MapSidebar.tsx
git commit -m "feat: add click-outside handler to cancel editing"
```

---

### Task 6: Manual Testing

**Step 1: Run dev server**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map && npm run dev`

**Step 2: Test inline editing workflow**

1. Open the app and select a firecall
2. Enable edit mode
3. Click on a marker on the map to select it
4. Verify sidebar shows the item
5. Click on the card to enter edit mode
6. Verify all fields appear
7. Edit the name field
8. Press Enter - verify Snackbar shows "Gespeichert"
9. Verify the change persisted

**Step 3: Test cancel workflow**

1. Enter edit mode on an item
2. Make changes
3. Press Escape - verify changes are discarded
4. Click on an item, enter edit mode, click outside - verify changes are discarded

**Step 4: Test different item types**

Test with: Marker, Vehicle, Rohr, Circle, Area, Line, Diary

**Step 5: Final commit**

```bash
git add -A
git commit -m "test: verify inline sidebar editing works"
```
