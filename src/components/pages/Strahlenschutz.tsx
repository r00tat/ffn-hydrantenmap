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
  StrahlenschutzHistoryEntry,
  StrahlenschutzValues,
} from '../../common/strahlenschutz';

const fieldLabels: Record<keyof StrahlenschutzValues, string> = {
  d1: 'Abstand 1 (m)',
  r1: 'Dosisleistung 1 (µSv/h)',
  d2: 'Abstand 2 (m)',
  r2: 'Dosisleistung 2 (µSv/h)',
};

function parseInput(value: string): number | null {
  if (value.trim() === '') return null;
  const num = parseFloat(value.replace(',', '.'));
  return isNaN(num) ? null : num;
}

export default function Strahlenschutz() {
  const [inputs, setInputs] = useState<Record<keyof StrahlenschutzValues, string>>({
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

    // Fill in the calculated field
    setInputs((prev) => ({
      ...prev,
      [result.field]: result.value.toFixed(4).replace(/\.?0+$/, ''),
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
        Strahlenschutz - Quadratisches Abstandsgesetz
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        D1² × R1 = D2² × R2 — Gib 3 Werte ein, der 4. wird berechnet. Lasse
        das zu berechnende Feld leer.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {(Object.keys(fieldLabels) as (keyof StrahlenschutzValues)[]).map(
          (field) => (
            <TextField
              key={field}
              label={fieldLabels[field]}
              value={inputs[field]}
              onChange={handleChange(field)}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{
                inputLabel: { shrink: true },
              }}
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
        <Box sx={{ mt: 2, p: 2, bgcolor: 'success.main', color: 'success.contrastText', borderRadius: 1 }}>
          <Typography variant="h6">
            {fieldLabels[result.field]} ={' '}
            {result.value.toFixed(4).replace(/\.?0+$/, '')}
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
                  primary={`${fieldLabels[entry.calculatedField]} = ${
                    entry[entry.calculatedField]
                      .toFixed(4)
                      .replace(/\.?0+$/, '')
                  }`}
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
