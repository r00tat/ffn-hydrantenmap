'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { defaultPosition } from '../../../hooks/constants';
import useFahrtenbuchGroupStandort from '../../../hooks/useFahrtenbuchGroupStandort';
import { saveFahrtenbuchGroupStandort } from '../stammdatenActions';

export default function GroupSettings({ groupId }: { groupId: string }) {
  const t = useTranslations('fahrtenbuch');
  const { standort, configured } = useFahrtenbuchGroupStandort(groupId);
  const [feedback, setFeedback] = useState<
    { severity: 'success' | 'error'; text: string } | undefined
  >();
  const [saving, setSaving] = useState(false);

  // Nur die Eingaben des Benutzers liegen im State; angezeigt wird sonst der
  // geladene Wert. Ein `useState`-Anfangswert griffe nur beim ersten Rendern —
  // der Firestore-Snapshot kommt aber später und das Formular zeigte dann
  // dauerhaft den Standardstandort.
  const [edits, setEdits] = useState<{ lat?: string; lng?: string }>({});
  // Ohne gepflegten Standort bleiben die Felder leer und zeigen den
  // Standardstandort nur als Platzhalter: Die Verwalterin einer anderen
  // Feuerwehr sähe sonst die Neusiedler Koordinaten wie einen eigenen Wert und
  // schriebe sie mit einem Klick auf Speichern als gepflegt fest.
  const lat = edits.lat ?? (configured ? String(standort.lat) : '');
  const lng = edits.lng ?? (configured ? String(standort.lng) : '');

  const save = async () => {
    setSaving(true);
    setFeedback(undefined);
    try {
      // Beide Felder leer heißt: zurücksetzen. `Number('')` wäre 0 und ergäbe
      // den Nullmeridian-Punkt (0,0), den die Action ohnehin ablehnt — es gäbe
      // damit keinen Weg zurück zum Standardstandort.
      const cleared = !lat.trim() && !lng.trim();
      const result = await saveFahrtenbuchGroupStandort(
        groupId,
        cleared ? undefined : { lat: Number(lat), lng: Number(lng) },
      );
      if (!result.success) {
        setFeedback({
          severity: 'error',
          text:
            result.error === 'standortInvalid'
              ? t('admin.standortInvalid')
              : t('admin.standortSaveFailed', { message: result.error ?? '' }),
        });
        return;
      }
      // Eingaben verwerfen, damit wieder der geladene Wert angezeigt wird —
      // der Snapshot liefert ihn ohnehin gleich nach.
      setEdits({});
      setFeedback({ severity: 'success', text: t('admin.standortSaved') });
    } catch (err) {
      setFeedback({
        severity: 'error',
        text: t('admin.standortSaveFailed', {
          message: (err as Error).message,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 480 }}>
      <Typography variant="h6" gutterBottom>
        {t('admin.standort')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin.standortHint')}
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

      <Grid container spacing={2}>
        <Grid size={{ xs: 6 }}>
          <TextField
            label={t('admin.latitude')}
            type="number"
            placeholder={String(defaultPosition.lat)}
            value={lat}
            onChange={(e) =>
              setEdits((prev) => ({ ...prev, lat: e.target.value }))
            }
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            label={t('admin.longitude')}
            type="number"
            placeholder={String(defaultPosition.lng)}
            value={lng}
            onChange={(e) =>
              setEdits((prev) => ({ ...prev, lng: e.target.value }))
            }
            fullWidth
          />
        </Grid>
      </Grid>

      <Stack direction="row" sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={saving}>
          {t('save')}
        </Button>
      </Stack>
    </Paper>
  );
}
