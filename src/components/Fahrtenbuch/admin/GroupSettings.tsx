'use client';

import MapIcon from '@mui/icons-material/Map';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { defaultPosition } from '../../../hooks/constants';
import useFahrtenbuchGroupStandort from '../../../hooks/useFahrtenbuchGroupStandort';
import useGroupFeuerwehrName from '../../../hooks/useGroupFeuerwehrName';
import LocationMapPicker from '../../Einsatzorte/LocationMapPicker';
import {
  saveFahrtenbuchGroupFeuerwehrName,
  saveFahrtenbuchGroupStandort,
} from '../stammdatenActions';

/**
 * Stellen nach dem Komma, mit denen eine auf der Karte gewählte Position in die
 * Felder geschrieben wird — wie bei den Risikoobjekten. Sechs Stellen sind
 * besser als zentimetergenau; ohne die Rundung stünde eine 15-stellige Zahl im
 * Feld, die niemand mehr von Hand prüfen kann.
 */
const MAP_DECIMALS = 6;

export default function GroupSettings({ groupId }: { groupId: string }) {
  const t = useTranslations('fahrtenbuch');
  const { standort, configured } = useFahrtenbuchGroupStandort(groupId);
  const [feedback, setFeedback] = useState<
    { severity: 'success' | 'error'; text: string } | undefined
  >();
  const [saving, setSaving] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const feuerwehrName = useGroupFeuerwehrName(groupId);
  // Wie bei den Standort-Feldern: Nur die Eingabe liegt im State, sonst wird
  // der geladene Wert gezeigt — der Firestore-Snapshot kommt später als der
  // erste Render, ein `useState`-Anfangswert bliebe leer.
  const [nameEdit, setNameEdit] = useState<string>();
  const nameValue = nameEdit ?? feuerwehrName ?? '';

  const speichereName = async () => {
    setSaving(true);
    setFeedback(undefined);
    const result = await saveFahrtenbuchGroupFeuerwehrName(groupId, nameValue);
    if (result.success) {
      // Eingabe verwerfen, damit wieder der geladene Wert angezeigt wird.
      setNameEdit(undefined);
      setFeedback({
        severity: 'success',
        text: t('groupSettings.feuerwehrNameSaved'),
      });
    } else {
      setFeedback({ severity: 'error', text: result.error ?? '' });
    }
    setSaving(false);
  };

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

  /**
   * Ausgangsmarkierung der Karte: der Wert aus den Feldern, nicht der geladene
   * Standort. Wer Koordinaten getippt hat und dann die Karte öffnet, will genau
   * dort nachjustieren.
   *
   * Ohne Wert bleibt sie leer. Eine Markierung auf dem Standardstandort würde
   * sonst ein „Übernehmen“ genügen lassen, um die Neusiedler Koordinaten als
   * eigenen, gepflegten Wert festzuschreiben.
   */
  const mapLat = Number.parseFloat(lat);
  const mapLng = Number.parseFloat(lng);
  const mapPositionSet = Number.isFinite(mapLat) && Number.isFinite(mapLng);

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
    <Paper sx={{ p: 3 }}>
      {feedback && (
        <Alert
          severity={feedback.severity}
          sx={{ mb: 2 }}
          onClose={() => setFeedback(undefined)}
        >
          {feedback.text}
        </Alert>
      )}

      <Typography variant="h6" gutterBottom>
        {t('groupSettings.feuerwehrName')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('groupSettings.feuerwehrNameHelp')}
      </Typography>

      <TextField
        fullWidth
        label={t('groupSettings.feuerwehrName')}
        value={nameValue}
        onChange={(e) => setNameEdit(e.target.value)}
      />

      <Stack direction="row" sx={{ mt: 2 }}>
        {/* Eigene Beschriftung und nicht das allgemeine „Speichern": In
            derselben Karte steht darunter der Speichern-Knopf des Standorts,
            und zwei gleich benannte Knöpfe wären nicht zu unterscheiden. */}
        <Button variant="contained" onClick={speichereName} disabled={saving}>
          {t('groupSettings.saveFeuerwehrName')}
        </Button>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        {t('admin.standort')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin.standortHint')}
      </Typography>

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

      <Stack direction="row" sx={{ mt: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<MapIcon />}
          onClick={() => setMapOpen(true)}
        >
          {t('admin.standortMap')}
        </Button>
      </Stack>

      <Stack direction="row" sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={saving}>
          {t('save')}
        </Button>
      </Stack>

      {/* Dieselbe Karte wie bei den Risikoobjekten und Einsatzorten. Die
          Auswahl füllt nur die Felder — gespeichert wird erst mit „Speichern“,
          wie bei einer Eingabe von Hand. */}
      <LocationMapPicker
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={(pickedLat, pickedLng) =>
          setEdits({
            lat: pickedLat.toFixed(MAP_DECIMALS),
            lng: pickedLng.toFixed(MAP_DECIMALS),
          })
        }
        showFirecallLayers={false}
        title={t('admin.standortPick')}
        initialLat={mapPositionSet ? mapLat : undefined}
        initialLng={mapPositionSet ? mapLng : undefined}
        center={standort}
      />
    </Paper>
  );
}
