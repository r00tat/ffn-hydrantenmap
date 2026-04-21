'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { RadiacodeSettings } from '../../hooks/radiacode/types';

export interface RadiacodeSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  readSettings: () => Promise<RadiacodeSettings>;
  writeSettings: (patch: Partial<RadiacodeSettings>) => Promise<void>;
  playSignal: () => Promise<void>;
  doseReset: () => Promise<void>;
}

function uRh_to_uSvh(uRh: number): number {
  return uRh / 100;
}
function uSvh_to_uRh(uSvh: number): number {
  return Math.max(0, Math.round(uSvh * 100));
}
function uR_to_uSv(uR: number): number {
  return uR / 100;
}
function uSv_to_uR(uSv: number): number {
  return Math.max(0, Math.round(uSv * 100));
}

function diff(
  initial: RadiacodeSettings,
  current: RadiacodeSettings,
): Partial<RadiacodeSettings> {
  const out: Partial<RadiacodeSettings> = {};
  for (const k of Object.keys(current) as (keyof RadiacodeSettings)[]) {
    if (initial[k] !== current[k]) {
      // @ts-expect-error — keyof narrows away the union at runtime
      out[k] = current[k];
    }
  }
  return out;
}

export default function RadiacodeSettingsDialog({
  open,
  onClose,
  readSettings,
  writeSettings,
  playSignal,
  doseReset,
}: RadiacodeSettingsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<RadiacodeSettings | null>(null);
  const [current, setCurrent] = useState<RadiacodeSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setInitial(null);
    setCurrent(null);
    readSettings()
      .then((s) => {
        if (cancelled) return;
        setInitial(s);
        setCurrent(s);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, readSettings]);

  const hasChanges =
    initial !== null &&
    current !== null &&
    Object.keys(diff(initial, current)).length > 0;

  const handleSave = async () => {
    if (!initial || !current) return;
    setSaving(true);
    setSaveError(null);
    try {
      await writeSettings(diff(initial, current));
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const canEdit = !!current && !loading;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Geräte-Einstellungen</DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        )}
        {loadError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        )}
        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {saveError}
          </Alert>
        )}
        {canEdit && current && (
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Section title="Alarm-Schwellen">
              <TextField
                label="Dosisleistung Stufe 1 (µSv/h)"
                type="number"
                value={uRh_to_uSvh(current.doseRateAlarm1uRh)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseRateAlarm1uRh: uSvh_to_uRh(Number(e.target.value)),
                  })
                }
              />
              <TextField
                label="Dosisleistung Stufe 2 (µSv/h)"
                type="number"
                value={uRh_to_uSvh(current.doseRateAlarm2uRh)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseRateAlarm2uRh: uSvh_to_uRh(Number(e.target.value)),
                  })
                }
              />
              <TextField
                label="Gesamtdosis Stufe 1 (µSv)"
                type="number"
                value={uR_to_uSv(current.doseAlarm1uR)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseAlarm1uR: uSv_to_uR(Number(e.target.value)),
                  })
                }
              />
              <TextField
                label="Gesamtdosis Stufe 2 (µSv)"
                type="number"
                value={uR_to_uSv(current.doseAlarm2uR)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseAlarm2uR: uSv_to_uR(Number(e.target.value)),
                  })
                }
              />
            </Section>
            <Section title="Signalisierung">
              <FormControlLabel
                control={
                  <Switch
                    checked={current.soundOn}
                    onChange={(_, v) =>
                      setCurrent({ ...current, soundOn: v })
                    }
                  />
                }
                label="Sound"
              />
              <Box sx={{ px: 2, mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Lautstärke: {current.soundVolume}
                </Typography>
                <Slider
                  value={current.soundVolume}
                  min={0}
                  max={9}
                  step={1}
                  marks
                  disabled={!current.soundOn}
                  onChange={(_, v) =>
                    setCurrent({ ...current, soundVolume: v as number })
                  }
                />
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={current.vibroOn}
                    onChange={(_, v) =>
                      setCurrent({ ...current, vibroOn: v })
                    }
                  />
                }
                label="Vibration"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={current.ledsOn}
                    onChange={(_, v) =>
                      setCurrent({ ...current, ledsOn: v })
                    }
                  />
                }
                label="LEDs"
              />
            </Section>
            <Section title="Einheiten">
              <FormControlLabel
                control={
                  <Switch
                    checked={current.doseUnitsSv}
                    onChange={(_, v) =>
                      setCurrent({ ...current, doseUnitsSv: v })
                    }
                  />
                }
                label="Dosis in Sv (statt R)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={current.countRateCpm}
                    onChange={(_, v) =>
                      setCurrent({ ...current, countRateCpm: v })
                    }
                  />
                }
                label="Zählrate in cpm (statt cps)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={current.doseRateNSvh}
                    onChange={(_, v) =>
                      setCurrent({ ...current, doseRateNSvh: v })
                    }
                  />
                }
                label="Dosisleistung in nSv/h (statt µSv/h)"
              />
            </Section>
          </Stack>
        )}
        <Section title="Aktionen">
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button onClick={() => void playSignal()}>
              Signalton abspielen
            </Button>
            <ConfirmDoseResetButton doseReset={doseReset} />
          </Stack>
        </Section>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="contained"
          disabled={!hasChanges || saving}
          onClick={handleSave}
        >
          Speichern
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  );
}

function ConfirmDoseResetButton({
  doseReset,
}: {
  doseReset: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button color="warning" onClick={() => setConfirming(true)}>
        Dosis zurücksetzen
      </Button>
    );
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2">Wirklich zurücksetzen?</Typography>
      <Button
        color="warning"
        variant="contained"
        onClick={async () => {
          await doseReset();
          setConfirming(false);
        }}
      >
        Ja
      </Button>
      <Button onClick={() => setConfirming(false)}>Nein</Button>
    </Stack>
  );
}
