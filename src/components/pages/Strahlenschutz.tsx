'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import { useCallback, useMemo, useState } from 'react';
import {
  ALL_RADIATION_UNITS,
  AufenthaltszeitHistoryEntry,
  AufenthaltszeitValues,
  calculateAufenthaltszeit,
  calculateInverseSquareLaw,
  calculateSchutzwert,
  convertRadiationUnit,
  getCompatibleUnits,
  RadiationUnit,
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

function FormulaDisplay({
  formula,
  substituted,
}: {
  formula: string;
  substituted: string;
}) {
  return (
    <Box sx={{ mt: 1, fontFamily: 'monospace' }}>
      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
        {formula}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
        {substituted}
      </Typography>
    </Box>
  );
}

function getAbstandFormulaDisplay(
  field: keyof StrahlenschutzValues,
  values: StrahlenschutzValues,
  resultValue: number
) {
  const v = (key: keyof StrahlenschutzValues) =>
    key === field ? formatValue(resultValue) : formatValue(values[key]!);

  switch (field) {
    case 'r2':
      return {
        formula: 'R2 = D1² × R1 / D2²',
        substituted: `R2 = ${v('d1')}² × ${v('r1')} / ${v('d2')}² = ${v('r2')}`,
      };
    case 'r1':
      return {
        formula: 'R1 = D2² × R2 / D1²',
        substituted: `R1 = ${v('d2')}² × ${v('r2')} / ${v('d1')}² = ${v('r1')}`,
      };
    case 'd2':
      return {
        formula: 'D2 = D1 × √(R1 / R2)',
        substituted: `D2 = ${v('d1')} × √(${v('r1')} / ${v('r2')}) = ${v('d2')}`,
      };
    case 'd1':
      return {
        formula: 'D1 = D2 × √(R2 / R1)',
        substituted: `D1 = ${v('d2')} × √(${v('r2')} / ${v('r1')}) = ${v('d1')}`,
      };
  }
}

function getSchutzwertFormulaDisplay(
  field: keyof SchutzwertValues,
  values: SchutzwertValues,
  resultValue: number
) {
  const v = (key: keyof SchutzwertValues) =>
    key === field ? formatValue(resultValue) : formatValue(values[key]!);

  switch (field) {
    case 'r':
      return {
        formula: 'R = R₀ / S^n',
        substituted: `R = ${v('r0')} / ${v('s')}^${v('n')} = ${v('r')}`,
      };
    case 'r0':
      return {
        formula: 'R₀ = R × S^n',
        substituted: `R₀ = ${v('r')} × ${v('s')}^${v('n')} = ${v('r0')}`,
      };
    case 's':
      return {
        formula: 'S = (R₀ / R)^(1/n)',
        substituted: `S = (${v('r0')} / ${v('r')})^(1/${v('n')}) = ${v('s')}`,
      };
    case 'n':
      return {
        formula: 'n = log(R₀ / R) / log(S)',
        substituted: `n = log(${v('r0')} / ${v('r')}) / log(${v('s')}) = ${v('n')}`,
      };
  }
}

function getAufenthaltszeitFormulaDisplay(
  field: keyof AufenthaltszeitValues,
  values: AufenthaltszeitValues,
  resultValue: number
) {
  const v = (key: keyof AufenthaltszeitValues) =>
    key === field ? formatValue(resultValue) : formatValue(values[key]!);

  switch (field) {
    case 't':
      return {
        formula: 't = D / R',
        substituted: `t = ${v('d')} / ${v('r')} = ${v('t')}`,
      };
    case 'd':
      return {
        formula: 'D = t × R',
        substituted: `D = ${v('t')} × ${v('r')} = ${v('d')}`,
      };
    case 'r':
      return {
        formula: 'R = D / t',
        substituted: `R = ${v('d')} / ${v('t')} = ${v('r')}`,
      };
  }
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

      {result && (() => {
        const formulaDisplay = getAbstandFormulaDisplay(result.field, values, result.value);
        return (
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
            <FormulaDisplay
              formula={formulaDisplay.formula}
              substituted={formulaDisplay.substituted}
            />
          </Box>
        );
      })()}

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
            {history.map((entry, index) => {
              const fd = getAbstandFormulaDisplay(entry.calculatedField, entry, entry[entry.calculatedField]);
              return (
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
                    secondary={
                      <>
                        {fd.formula}
                        <br />
                        {fd.substituted}
                        <br />
                        {entry.timestamp.toLocaleTimeString()}
                      </>
                    }
                  />
                </ListItem>
              );
            })}
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

      {result && (() => {
        const formulaDisplay = getSchutzwertFormulaDisplay(result.field, values, result.value);
        return (
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
            <FormulaDisplay
              formula={formulaDisplay.formula}
              substituted={formulaDisplay.substituted}
            />
          </Box>
        );
      })()}

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
            {history.map((entry, index) => {
              const fd = getSchutzwertFormulaDisplay(entry.calculatedField, entry, entry[entry.calculatedField]);
              return (
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
                    secondary={
                      <>
                        {fd.formula}
                        <br />
                        {fd.substituted}
                        <br />
                        {entry.timestamp.toLocaleTimeString()}
                      </>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Box>
      )}
    </Box>
  );
}

// --- Aufenthaltszeit ---

const aufenthaltszeitLabels: Record<keyof AufenthaltszeitValues, string> = {
  t: 'Aufenthaltszeit (h)',
  d: 'Zulässige Dosis (mSv)',
  r: 'Dosisleistung (mSv/h)',
};

function AufenthaltszeitRechner() {
  const [inputs, setInputs] = useState<
    Record<keyof AufenthaltszeitValues, string>
  >({
    t: '',
    d: '',
    r: '',
  });
  const [history, setHistory] = useState<AufenthaltszeitHistoryEntry[]>([]);

  const values: AufenthaltszeitValues = useMemo(
    () => ({
      t: parseInput(inputs.t),
      d: parseInput(inputs.d),
      r: parseInput(inputs.r),
    }),
    [inputs]
  );

  const result = useMemo(() => calculateAufenthaltszeit(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const handleChange = useCallback(
    (field: keyof AufenthaltszeitValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    []
  );

  const handleCalculate = useCallback(() => {
    if (!result) return;
    const entry: AufenthaltszeitHistoryEntry = {
      t: result.field === 't' ? result.value : values.t!,
      d: result.field === 'd' ? result.value : values.d!,
      r: result.field === 'r' ? result.value : values.r!,
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
    setInputs({ t: '', d: '', r: '' });
  }, []);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Aufenthaltszeit
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        t = D / R — Gib 2 Werte ein, der 3. wird berechnet. Lasse das zu
        berechnende Feld leer.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
        {(
          Object.keys(aufenthaltszeitLabels) as (keyof AufenthaltszeitValues)[]
        ).map((field) => (
          <TextField
            key={field}
            label={aufenthaltszeitLabels[field]}
            value={inputs[field]}
            onChange={handleChange(field)}
            type="text"
            inputMode="decimal"
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        ))}
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

      {result && (() => {
        const formulaDisplay = getAufenthaltszeitFormulaDisplay(result.field, values, result.value);
        return (
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
              {aufenthaltszeitLabels[result.field]} = {formatValue(result.value)}
            </Typography>
            <FormulaDisplay
              formula={formulaDisplay.formula}
              substituted={formulaDisplay.substituted}
            />
          </Box>
        );
      })()}

      {nullCount !== 1 && nullCount > 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          Bitte genau 2 Werte eingeben (aktuell {3 - nullCount} von 2).
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
            {history.map((entry, index) => {
              const fd = getAufenthaltszeitFormulaDisplay(entry.calculatedField, entry, entry[entry.calculatedField]);
              return (
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
                    primary={`${aufenthaltszeitLabels[entry.calculatedField]} = ${formatValue(entry[entry.calculatedField])}`}
                    secondary={
                      <>
                        {fd.formula}
                        <br />
                        {fd.substituted}
                        <br />
                        {entry.timestamp.toLocaleTimeString()}
                      </>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Box>
      )}
    </Box>
  );
}

// --- Einheitenumrechnung ---

interface ConversionHistoryEntry {
  value: number;
  from: RadiationUnit;
  result: number;
  to: RadiationUnit;
  timestamp: Date;
}

function Einheitenumrechnung() {
  const [inputValue, setInputValue] = useState('');
  const [fromUnit, setFromUnit] = useState<RadiationUnit>('mSv');
  const [toUnit, setToUnit] = useState<RadiationUnit>('µSv');
  const [history, setHistory] = useState<ConversionHistoryEntry[]>([]);

  const compatibleUnits = useMemo(
    () => getCompatibleUnits(fromUnit),
    [fromUnit]
  );

  // When source unit changes, ensure target unit stays compatible
  const effectiveToUnit = useMemo(() => {
    if (compatibleUnits.includes(toUnit)) return toUnit;
    return compatibleUnits[0];
  }, [compatibleUnits, toUnit]);

  const parsedValue = useMemo(() => parseInput(inputValue), [inputValue]);

  const result = useMemo(() => {
    if (parsedValue === null) return null;
    return convertRadiationUnit(parsedValue, fromUnit, effectiveToUnit);
  }, [parsedValue, fromUnit, effectiveToUnit]);

  const handleConvert = useCallback(() => {
    if (result === null || parsedValue === null) return;
    setHistory((prev) => [
      {
        value: parsedValue,
        from: fromUnit,
        result,
        to: effectiveToUnit,
        timestamp: new Date(),
      },
      ...prev,
    ]);
  }, [result, parsedValue, fromUnit, effectiveToUnit]);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Einheitenumrechnung
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Dosis und Dosisleistung umrechnen. 1 R ≈ 0,01 Sv (Gamma, Weichteilgewebe).
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Wert"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          type="text"
          inputMode="decimal"
          variant="outlined"
          size="small"
          sx={{ minWidth: 120 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          select
          label="Von"
          value={fromUnit}
          onChange={(e) => setFromUnit(e.target.value as RadiationUnit)}
          variant="outlined"
          size="small"
          sx={{ minWidth: 120 }}
        >
          {ALL_RADIATION_UNITS.map((unit) => (
            <MenuItem key={unit} value={unit}>
              {unit}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body1">=</Typography>
        <TextField
          select
          label="Nach"
          value={effectiveToUnit}
          onChange={(e) => setToUnit(e.target.value as RadiationUnit)}
          variant="outlined"
          size="small"
          sx={{ minWidth: 120 }}
        >
          {compatibleUnits.map((unit) => (
            <MenuItem key={unit} value={unit}>
              {unit}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          onClick={handleConvert}
          disabled={result === null}
        >
          Umrechnen
        </Button>
      </Box>

      {result !== null && parsedValue !== null && (
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
            {formatValue(parsedValue)} {fromUnit} = {formatValue(result)}{' '}
            {effectiveToUnit}
          </Typography>
        </Box>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            Umrechnungsverlauf
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
                  primary={`${formatValue(entry.value)} ${entry.from} = ${formatValue(entry.result)} ${entry.to}`}
                  secondary={entry.timestamp.toLocaleTimeString()}
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
      <Divider />
      <AufenthaltszeitRechner />
      <Divider />
      <Einheitenumrechnung />
    </Box>
  );
}
