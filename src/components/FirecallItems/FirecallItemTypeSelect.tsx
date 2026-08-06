'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useTranslations } from 'next-intl';
import { ReactNode, useMemo } from 'react';
import { fcItemNames } from './elements';
import {
  FirecallItemGroupKey,
  groupedCreatableItemTypes,
} from './elements/itemGroups';
import FirecallItemTypeIcon from './FirecallItemTypeIcon';

export interface FirecallItemTypeSelectOptions {
  value: string;
  onChange: (type: string) => void;
}

/**
 * Element type picker for the firecall item dialog: shows the map icon of each
 * type and sorts them into thematic groups so they can be found at a glance.
 */
export default function FirecallItemTypeSelect({
  value,
  onChange,
}: FirecallItemTypeSelectOptions) {
  const t = useTranslations('firecallItem');
  const tGroups = useTranslations('firecallItem.itemGroups');
  const tMarkerNames = useTranslations('firecallItem.markerNames');

  const label = (type: string) => {
    const key = type as Parameters<typeof tMarkerNames>[0];
    return tMarkerNames.has(key) ? tMarkerNames(key) : fcItemNames[type] || type;
  };

  const groups = useMemo(() => groupedCreatableItemTypes(), []);

  const entry = (type: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          flexShrink: 0,
        }}
      >
        <FirecallItemTypeIcon type={type} />
      </Box>
      {label(type)}
    </Box>
  );

  // MUI matches a Select's value against its direct children, so the groups
  // have to be rendered as one flat array — wrapping them in fragments would
  // break both the value lookup and keyboard navigation.
  const options = groups.flatMap((group): ReactNode[] => [
    <ListSubheader key={`group-${group.key}`}>
      {tGroups(group.key as FirecallItemGroupKey)}
    </ListSubheader>,
    ...group.itemTypes.map((type) => (
      <MenuItem key={type} value={type}>
        {entry(type)}
      </MenuItem>
    )),
  ]);

  return (
    <FormControl fullWidth variant="standard">
      <InputLabel id="firecall-item-type-label">{t('elementType')}</InputLabel>
      <Select
        labelId="firecall-item-type-label"
        id="firecall-item-type"
        value={value}
        label={t('elementType')}
        onChange={(event) => onChange(event.target.value)}
        renderValue={(type) => entry(type)}
      >
        {options}
      </Select>
    </FormControl>
  );
}
