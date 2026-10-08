'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  getBekleidungswartOptions,
  saveBekleidungswarte,
  type BekleidungswartCandidate,
} from './bekleidungswartActions';

/**
 * Die Bekleidungswarte einer Gruppe. Wie bei den Mangel-Empfängern über Server
 * Actions und nicht über einen Firestore-Snapshot: Die Rolle steht an den
 * Benutzerdokumenten, und die darf ein Client nicht querlesen.
 *
 * Anders als dort **ohne** `freeSolo` — wählbar sind nur existierende
 * Mitglieder der Gruppe.
 */
export default function BekleidungswartSettings({
  groupId,
}: {
  groupId: string;
}) {
  const t = useTranslations('bekleidung');
  const [members, setMembers] = useState<BekleidungswartCandidate[]>([]);
  const [selected, setSelected] = useState<BekleidungswartCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { severity: 'success' | 'error'; text: string } | undefined
  >();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await getBekleidungswartOptions(groupId);
        if (!active) return;
        if (!result.success) {
          // Bewusst kein `setLoaded(true)`: Mit leerer Auswahl und
          // freigeschaltetem Speichern-Knopf entzöge ein Klick allen
          // eingetragenen Bekleidungswarten die Rolle.
          setFeedback({
            severity: 'error',
            text: t('settings.loadFailed', {
              message: result.error ?? '',
            }),
          });
          return;
        }
        setMembers(result.members);
        setSelected(
          result.members.filter((m) => result.selected.includes(m.uid)),
        );
        setLoaded(true);
      } catch (err) {
        if (!active) return;
        setFeedback({
          severity: 'error',
          text: t('settings.loadFailed', {
            message: (err as Error).message,
          }),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [groupId, t]);

  const saveErrorText = (error?: string): string => {
    if (error === 'notAMember') return t('settings.notAMember');
    return t('settings.saveFailed', { message: error ?? '' });
  };

  const save = async () => {
    setSaving(true);
    setFeedback(undefined);
    try {
      const result = await saveBekleidungswarte(
        groupId,
        selected.map((m) => m.uid),
      );
      if (!result.success) {
        setFeedback({ severity: 'error', text: saveErrorText(result.error) });
        return;
      }
      setFeedback({
        severity: 'success',
        text: t('settings.saved'),
      });
    } catch (err) {
      setFeedback({
        severity: 'error',
        text: saveErrorText((err as Error).message),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('settings.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('settings.hint')}
      </Typography>

      {feedback && (
        <Alert
          severity={feedback.severity}
          sx={{ mb: 2 }}
          onClose={() => setFeedback(undefined)}
        >
          {feedback.text}
        </Alert>
      )}

      {loaded && members.length === 0 ? (
        <Typography color="text.secondary">
          {t('settings.noMembers')}
        </Typography>
      ) : (
        <Autocomplete
          multiple
          options={members}
          value={selected}
          disabled={!loaded}
          isOptionEqualToValue={(option, value) => option.uid === value.uid}
          getOptionLabel={(option) =>
            option.email
              ? `${option.displayName} (${option.email})`
              : option.displayName
          }
          onChange={(_event, value) => setSelected(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('settings.label')}
              placeholder={t('settings.placeholder')}
              helperText={t('settings.helper')}
            />
          )}
        />
      )}

      <Stack direction="row" sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={saving || !loaded}>
          {t('settings.save')}
        </Button>
      </Stack>
    </Paper>
  );
}
