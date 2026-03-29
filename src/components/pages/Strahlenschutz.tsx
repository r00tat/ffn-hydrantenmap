'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import { useCallback, useMemo, useState } from 'react';
import {
  calculateInverseSquareLaw,
  calculateSchutzwert,
  SchutzwertHistoryEntry,
  SchutzwertValues,
  StrahlenschutzHistoryEntry,
  StrahlenschutzValues,
} from '../../common/strahlenschutz';

function parseInput(value: string): number | null {
  if (value.trim() === '') return null;
  const num = parseFloat(value.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function formatValue(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

// --- Abstandsgesetz ---

const abstandLabels: Record<keyof StrahlenschutzValues, string> = {
  d1: 'Abstand 1 (m)',
  r1: 'Dosisleistung 1 (µSv/h)',
  d2: 'Abstand 2 (m)',
  r2: 'Dosisleistung 2 (µSv/h)',
};

function Abstandsgesetz() {
  const [inputs, setInputs] = useState<
    Record<keyof StrahlenschutzValues, string>
  >({
    d1: '',
    r1: '',
    d2: '',
    r2: '',
  });
  const [history, setHistory] = useState<StrahlenschutzHistoryEntry[]>([]);

  const values: StrahlenschutzValues = useMemo(
    () => ({
      d1: parseInput(inputs.d1),
      r1: parseInput(inputs.r1),
      d2: parseInput(inputs.d2),
      r2: parseInput(inputs.r2),
    }),
    [inputs]
  );

  const result = useMemo(() => calculateInverseSquareLaw(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const handleChange = useCallback(
    (field: keyof StrahlenschutzValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    []
  );

  const handleCalculate = useCallback(() => {
    if (!result) return;
    const entry: StrahlenschutzHistoryEntry = {
      d1: result.field === 'd1' ? result.value : values.d1!,
      r1: result.field === 'r1' ? result.value : values.r1!,
      d2: result.field === 'd2' ? result.value : values.d2!,
      r2: result.field === 'r2' ? result.value : values.r2!,
      calculatedField: result.field,
      timestamp: new Date(),
    };
    setHistory((prev) => [entry, ...prev]);
    setInputs((prev) => ({
      ...prev,
      [result.field]: formatValue(result.value),
    }));
  }, [result, values]);

  const handleClear = useCallback(() => {
    setInputs({ d1: '', r1: '', d2: '', r2: '' });
  }, []);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Quadratisches Abstandsgesetz
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        D1² × R1 = D2² × R2 — Gib 3 Werte ein, der 4. wird berechnet. Lasse
        das zu berechnende Feld leer.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {(Object.keys(abstandLabels) as (keyof StrahlenschutzValues)[]).map(
          (field) => (
            <TextField
              key={field}
              label={abstandLabels[field]}
              value={inputs[field]}
              onChange={handleChange(field)}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          onClick={handleCalculate}
          disabled={!result}
        >
          Berechnen
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          Löschen
        </Button>
      </Box>

      {result && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: 'success.main',
            color: 'success.contrastText',
            borderRadius: 1,
          }}
        >
          <Typography variant="h6">
            {abstandLabels[result.field]} = {formatValue(result.value)}
          </Typography>
        </Box>
      )}

      {nullCount !== 1 && nullCount > 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          Bitte genau 3 Werte eingeben (aktuell {4 - nullCount} von 3).
        </Typography>
      )}
      {nullCount === 0 && (
        <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
          Alle Felder sind ausgefüllt. Lösche ein Feld um eine Berechnung
          durchzuführen.
        </Typography>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            Berechnungsverlauf
          </Typography>
          <List dense>
            {history.map((entry, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="Löschen"
                    onClick={() => handleDeleteHistoryEntry(index)}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={`${abstandLabels[entry.calculatedField]} = ${formatValue(entry[entry.calculatedField])}`}
                  secondary={`D1=${entry.d1} m, R1=${entry.r1} µSv/h, D2=${entry.d2} m, R2=${entry.r2} µSv/h — ${entry.timestamp.toLocaleTimeString()}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
}

// --- Schutzwert ---

const schutzwertLabels: Record<keyof SchutzwertValues, string> = {
  r0: 'Dosisleistung ohne Abschirmung (µSv/h)',
  r: 'Dosisleistung mit Abschirmung (µSv/h)',
  s: 'Schutzwert (S)',
  n: 'Anzahl der Schichten (n)',
};

function SchutzwertRechner() {
  const [inputs, setInputs] = useState<
    Record<keyof SchutzwertValues, string>
  >({
    r0: '',
    r: '',
    s: '',
    n: '',
  });
  const [history, setHistory] = useState<SchutzwertHistoryEntry[]>([]);

  const values: SchutzwertValues = useMemo(
    () => ({
      r0: parseInput(inputs.r0),
      r: parseInput(inputs.r),
      s: parseInput(inputs.s),
      n: parseInput(inputs.n),
    }),
    [inputs]
  );

  const result = useMemo(() => calculateSchutzwert(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const handleChange = useCallback(
    (field: keyof SchutzwertValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    []
  );

  const handleCalculate = useCallback(() => {
    if (!result) return;
    const entry: SchutzwertHistoryEntry = {
      r0: result.field === 'r0' ? result.value : values.r0!,
      r: result.field === 'r' ? result.value : values.r!,
      s: result.field === 's' ? result.value : values.s!,
      n: result.field === 'n' ? result.value : values.n!,
      calculatedField: result.field,
      timestamp: new Date(),
    };
    setHistory((prev) => [entry, ...prev]);
    setInputs((prev) => ({
      ...prev,
      [result.field]: formatValue(result.value),
    }));
  }, [result, values]);

  const handleClear = useCallback(() => {
    setInputs({ r0: '', r: '', s: '', n: '' });
  }, []);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Schutzwert (Abschirmung)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        R = R₀ / S^n — Gib 3 Werte ein, der 4. wird berechnet. Lasse das zu
        berechnende Feld leer.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {(Object.keys(schutzwertLabels) as (keyof SchutzwertValues)[]).map(
          (field) => (
            <TextField
              key={field}
              label={schutzwertLabels[field]}
              value={inputs[field]}
              onChange={handleChange(field)}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          onClick={handleCalculate}
          disabled={!result}
        >
          Berechnen
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          Löschen
        </Button>
      </Box>

      {result && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: 'success.main',
            color: 'success.contrastText',
            borderRadius: 1,
          }}
        >
          <Typography variant="h6">
            {schutzwertLabels[result.field]} = {formatValue(result.value)}
          </Typography>
        </Box>
      )}

      {nullCount !== 1 && nullCount > 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          Bitte genau 3 Werte eingeben (aktuell {4 - nullCount} von 3).
        </Typography>
      )}
      {nullCount === 0 && (
        <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
          Alle Felder sind ausgefüllt. Lösche ein Feld um eine Berechnung
          durchzuführen.
        </Typography>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            Berechnungsverlauf
          </Typography>
          <List dense>
            {history.map((entry, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="Löschen"
                    onClick={() => handleDeleteHistoryEntry(index)}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={`${schutzwertLabels[entry.calculatedField]} = ${formatValue(entry[entry.calculatedField])}`}
                  secondary={`R₀=${entry.r0} µSv/h, R=${entry.r} µSv/h, S=${entry.s}, n=${entry.n} — ${entry.timestamp.toLocaleTimeString()}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
}

// --- Main component ---

export default function Strahlenschutz() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Abstandsgesetz />
      <Divider />
      <SchutzwertRechner />
    </Box>
  );
}
