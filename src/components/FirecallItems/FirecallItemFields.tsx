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
import React, { useCallback, useMemo } from 'react';
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
  autoFocus?: boolean;
}

export default function FirecallItemFields({
  item,
  setItemField,
  showLatLng = true,
  showLayerSelect = true,
  autoFocus = false,
}: FirecallItemFieldsProps) {
  const layers = useFirecallLayers();

  // Find the first text-like field that should receive autoFocus
  const firstTextFieldKey = useMemo(() => {
    if (!autoFocus) return null;
    const fields = Object.entries(item.fields());
    const firstTextField = fields.find(([key]) => {
      const fieldType = item.fieldTypes()[key];
      // Text-like fields are those not in the special types list and not date fields
      return (
        !item.dateFields().includes(key) &&
        !['boolean', 'date', 'TaktischesZeichen', 'attachment', 'select', 'color'].includes(fieldType)
      );
    });
    return firstTextField?.[0] ?? null;
  }, [autoFocus, item]);

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
                autoFocus={key === firstTextFieldKey}
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
