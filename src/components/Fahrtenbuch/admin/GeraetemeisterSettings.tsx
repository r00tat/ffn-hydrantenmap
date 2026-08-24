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
  getFahrtenbuchGeraetemeisterOptions,
  saveFahrtenbuchGeraetemeister,
  type GeraetemeisterCandidate,
} from '../geraetemeisterActions';

/**
 * Die Gerätemeister einer Gruppe. Wie bei den Mangel-Empfängern über Server
 * Actions und nicht über einen Firestore-Snapshot: Die Rolle steht an den
 * Benutzerdokumenten, und die darf ein Client nicht querlesen.
 *
 * Anders als dort **ohne** `freeSolo` — wählbar sind nur existierende
 * Mitglieder der Gruppe.
 */
export default function GeraetemeisterSettings({
  groupId,
}: {
  groupId: string;
}) {
  const t = useTranslations('fahrtenbuch');
  const [members, setMembers] = useState<GeraetemeisterCandidate[]>([]);
  const [selected, setSelected] = useState<GeraetemeisterCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { severity: 'success' | 'error'; text: string } | undefined
  >();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await getFahrtenbuchGeraetemeisterOptions(groupId);
        if (!active) return;
        if (!result.success) {
          // Bewusst kein `setLoaded(true)`: Mit leerer Auswahl und
          // freigeschaltetem Speichern-Knopf entzöge ein Klick allen
          // eingetragenen Gerätemeistern die Rolle.
          setFeedback({
            severity: 'error',
            text: t('admin.geraetemeisterLoadFailed', {
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
          text: t('admin.geraetemeisterLoadFailed', {
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
    if (error === 'notAMember') return t('admin.geraetemeisterNotAMember');
    return t('admin.geraetemeisterSaveFailed', { message: error ?? '' });
  };

  const save = async () => {
    setSaving(true);
    setFeedback(undefined);
    try {
      const result = await saveFahrtenbuchGeraetemeister(
        groupId,
        selected.map((m) => m.uid),
      );
      if (!result.success) {
        setFeedback({ severity: 'error', text: saveErrorText(result.error) });
        return;
      }
      setFeedback({
        severity: 'success',
        text: t('admin.geraetemeisterSaved'),
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
        {t('admin.geraetemeister')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin.geraetemeisterHint')}
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
          {t('admin.geraetemeisterNoMembers')}
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
              label={t('admin.geraetemeisterLabel')}
              placeholder={t('admin.geraetemeisterPlaceholder')}
              helperText={t('admin.geraetemeisterHelper')}
            />
          )}
        />
      )}

      <Stack direction="row" sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={saving || !loaded}>
          {t('save')}
        </Button>
      </Stack>
    </Paper>
  );
}
