'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { setMyHomeGroup } from '../../app/actions/homeGroup';
import { isTenantGroupId } from '../../common/tenantGroups';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';

/** Leerer Wert des Selects für „keine Heimatgruppe". */
const NONE = '';

/**
 * Die eigene Heimatgruppe wählen. Die App übernimmt sie über den Listener auf
 * das Benutzerdokument — hier wird nur gespeichert, nicht lokal nachgeführt.
 */
export default function HomeGroupSelector() {
  const t = useTranslations('profile.homeGroup');
  const { myGroups, homeGroup } = useFirebaseLogin();
  const [pending, setPending] = useState(false);
  /** Bis der Listener nachzieht, zeigt das Select die eben gewählte Gruppe. */
  const [chosen, setChosen] = useState<string | undefined>();
  const [feedback, setFeedback] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null);

  const tenantGroups = useMemo(
    () =>
      myGroups.filter((g): g is { id: string; name: string } => isTenantGroupId(g.id)),
    [myGroups],
  );
  const current = chosen ?? homeGroup ?? NONE;
  const value = current === NONE || tenantGroups.some((g) => g.id === current) ? current : NONE;

  const handleChange = useCallback(
    async (event: SelectChangeEvent<string>) => {
      const next = event.target.value;
      setPending(true);
      setFeedback(null);
      try {
        const result = await setMyHomeGroup(next === NONE ? null : next);
        if ('error' in result) {
          setFeedback({ kind: 'error', message: t('error') });
          return;
        }
        setChosen(result.homeGroup ?? NONE);
        setFeedback({ kind: 'success', message: t('saved') });
      } catch (err) {
        console.error('setMyHomeGroup failed', err);
        setFeedback({ kind: 'error', message: t('error') });
      } finally {
        setPending(false);
      }
    },
    [t],
  );

  if (tenantGroups.length === 0) return null;

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('label')}
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
        {t('description')}
      </Typography>
      <FormControl size="small" sx={{ minWidth: 220 }} disabled={pending}>
        <InputLabel id="home-group-selector-label">{t('label')}</InputLabel>
        <Select
          labelId="home-group-selector-label"
          id="home-group-selector"
          value={value}
          label={t('label')}
          onChange={handleChange}
          displayEmpty
        >
          <MenuItem value={NONE}>{t('none')}</MenuItem>
          {tenantGroups.map((g) => (
            <MenuItem key={g.id} value={g.id}>
              {g.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {feedback && (
        <Alert severity={feedback.kind} sx={{ mt: 2 }}>
          {feedback.message}
        </Alert>
      )}
    </Box>
  );
}
