'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { isTenantGroupId } from '../../common/tenantGroups';
import { shareUnsharedRisikoObjekte } from './risikoobjektActions';

interface Props {
  count: number;
  groupNames: Record<string, string>;
}

/**
 * Für den Admin: Objekte ohne Freigabe sieht außer ihm niemand. Einmalig nach
 * dem Einführen der Freigabe und nach jedem GIS-Import mit neuen Objekten
 * gibt er sie hier in einem Zug frei.
 */
export default function UnsharedRisikoObjekteBanner({ count, groupNames }: Props) {
  const t = useTranslations('risikoobjekte');
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; count: number } | { ok: false; error: string }>();

  const options = Object.keys(groupNames)
    .filter(isTenantGroupId)
    .sort((a, b) => groupNames[a].localeCompare(groupNames[b]));

  const share = async () => {
    setBusy(true);
    try {
      setResult(await shareUnsharedRisikoObjekte(groups));
    } catch (err) {
      console.error('Freigabe fehlgeschlagen', err);
      setResult({ ok: false, error: 'unknown' });
    } finally {
      setBusy(false);
    }
  };

  if (result?.ok) {
    return (
      <Alert severity="success" sx={{ mb: 2 }}>
        {t('unsharedDone', { count: result.count })}
      </Alert>
    );
  }

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      {t('unshared', { count })}
      <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label={t('unsharedGroups')}
          value={groups}
          sx={{ minWidth: 220 }}
          slotProps={{
            select: {
              multiple: true,
              renderValue: (v) => (v as string[]).map((g) => groupNames[g] ?? g).join(', '),
            },
          }}
          onChange={(e) => {
            const v = e.target.value as unknown;
            setGroups(typeof v === 'string' ? v.split(',') : (v as string[]));
          }}
        >
          {options.map((g) => (
            <MenuItem key={g} value={g}>
              {groupNames[g]}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" size="small" disabled={busy || groups.length === 0} onClick={share}>
          {t('unsharedButton')}
        </Button>
      </Box>
      {result && !result.ok && (
        <Box sx={{ mt: 1 }}>{t(`errors.${result.error as 'unknown'}`)}</Box>
      )}
    </Alert>
  );
}
