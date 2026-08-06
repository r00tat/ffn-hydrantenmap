'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FahrtenbuchVehicle } from '../../common/fahrtenbuch';
import { downloadBlob } from '../firebase/download';
import { exportFahrtenbuchPdf } from './fahrtenbuchExportActions';

/**
 * Die Fehlerschlüssel, die `exportFahrtenbuchPdf` melden kann. Alles andere
 * gibt die Action als Klartext der Ausnahme zurück und wird wörtlich
 * durchgereicht — ein „exportTooLarge" mitten im Satz ist dagegen für
 * niemanden ein Satz.
 */
const KNOWN_ERROR_KEYS = [
  'exportRangeInvalid',
  'exportNoVehicles',
  'exportTooLarge',
  'notInGroup',
  'notLoggedIn',
] as const;

type KnownErrorKey = (typeof KNOWN_ERROR_KEYS)[number];

function isKnownErrorKey(error: string): error is KnownErrorKey {
  return (KNOWN_ERROR_KEYS as readonly string[]).includes(error);
}

/** Lokaler Tag als `YYYY-MM-DD` — `toISOString()` läge in UTC daneben. */
function toDayInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

export interface FahrtenbuchExportDialogProps {
  open: boolean;
  groupId: string;
  /**
   * Alle Fahrzeuge der Gruppe — auch stillgelegte. Ihre alten Fahrten gehören
   * in einen Nachweis über einen vergangenen Zeitraum, deshalb stehen sie zur
   * Wahl und sind wie alle anderen vorgehakt.
   */
  vehicles: FahrtenbuchVehicle[];
  onClose: () => void;
}

/**
 * Erzeugt den PDF-Export des Fahrtenbuchs: Zeitraum wählen, Fahrzeuge
 * abwählen, herunterladen. Vorgabe ist das laufende Jahr mit allen Fahrzeugen —
 * der Regelfall ist der Jahresnachweis der ganzen Feuerwehr.
 */
export default function FahrtenbuchExportDialog({
  open,
  groupId,
  vehicles,
  onClose,
}: FahrtenbuchExportDialogProps) {
  const t = useTranslations('fahrtenbuch');
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`);
  const [to, setTo] = useState(toDayInput(today));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(vehicles.map((v) => v.id as string)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const rangeValid = !!from && !!to && from <= to;
  const canExport = rangeValid && selected.size > 0 && !busy;

  const toggle = (vehicleId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(vehicleId);
      else next.delete(vehicleId);
      return next;
    });
  };

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await exportFahrtenbuchPdf({
        groupId,
        from,
        to,
        // In der Reihenfolge der Liste, nicht in der des Anklickens.
        vehicleIds: vehicles
          .map((v) => v.id as string)
          .filter((id) => selected.has(id)),
        // Der Server kennt die Zone des Benutzers nicht; ohne sie lägen
        // Tagesgrenzen und Uhrzeiten im Ausdruck um Stunden daneben.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!result.success || !result.pdfBase64) {
        setError(result.error ?? 'exportFailed');
        return;
      }
      await downloadBlob(
        base64ToBlob(result.pdfBase64),
        result.fileName ?? 'Fahrtenbuch.pdf',
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('export.title')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('errors.exportFailed', {
              message: isKnownErrorKey(error)
                ? t(`errors.${error}` as 'errors.exportTooLarge')
                : error,
            })}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('export.hint')}
        </Typography>

        <Grid container spacing={2} sx={{ mb: 1 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="date"
              label={t('filters.from')}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={busy}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="date"
              label={t('filters.to')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={busy}
              error={!rangeValid}
              helperText={rangeValid ? undefined : t('errors.exportRangeInvalid')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
        </Grid>

        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ mt: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            {t('export.vehicles')}
          </Typography>
          <Button
            size="small"
            disabled={busy || vehicles.length === 0}
            onClick={() =>
              setSelected(new Set(vehicles.map((v) => v.id as string)))
            }
          >
            {t('export.selectAll')}
          </Button>
          <Button
            size="small"
            disabled={busy || selected.size === 0}
            onClick={() => setSelected(new Set())}
          >
            {t('export.selectNone')}
          </Button>
        </Stack>

        {vehicles.length === 0 ? (
          <Typography color="text.secondary">
            {t('export.noVehicles')}
          </Typography>
        ) : (
          vehicles.map((vehicle) => (
            <Stack
              key={vehicle.id}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selected.has(vehicle.id as string)}
                    disabled={busy}
                    onChange={(e) =>
                      toggle(vehicle.id as string, e.target.checked)
                    }
                  />
                }
                label={vehicle.name}
              />
              {/* Außerhalb des Labels: sonst hieße die Checkbox für
                  Screenreader „Altes LF stillgelegt". */}
              {vehicle.active === false && (
                <Chip size="small" label={t('export.inactive')} />
              )}
              {vehicle.kennzeichen && (
                <Typography variant="caption" color="text.secondary">
                  {vehicle.kennzeichen}
                </Typography>
              )}
            </Stack>
          ))
        )}

        {busy && <LinearProgress sx={{ mt: 2 }} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('cancel')}
        </Button>
        <Button variant="contained" onClick={run} disabled={!canExport}>
          {t('export.run')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
