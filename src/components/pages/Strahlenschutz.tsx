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
import { useTranslations } from 'next-intl';
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
  ACTIVITY_UNITS,
  ActivityUnit,
  calculateDosisleistungNuklid,
  convertActivityToGBq,
  DosisleistungNuklidHistoryEntry,
  DosisleistungNuklidValues,
  NUCLIDES,
} from '../../common/strahlenschutz';

function parseInput(value: string): number | null {
  if (value.trim() === '') return null;
  const num = parseFloat(value.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function formatValue(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

/** Format hours as human-readable duration (e.g. "2 d 3 h 15 min 30 s") */
function formatDuration(hours: number): string {
  const totalSeconds = Math.round(hours * 3600);
  const days = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const min = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} d`);
  if (h > 0) parts.push(`${h} h`);
  if (min > 0) parts.push(`${min} min`);
  if (s > 0) parts.push(`${s} s`);

  return parts.length > 0 ? parts.join(' ') : '0 s';
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
  resultValue: number,
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
  resultValue: number,
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
  resultValue: number,
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

function Abstandsgesetz() {
  const t = useTranslations('schadstoff');
  const tAbstand = useTranslations('schadstoff.abstand.labels');
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
    [inputs],
  );

  const result = useMemo(() => calculateInverseSquareLaw(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const fieldKeys: (keyof StrahlenschutzValues)[] = ['d1', 'r1', 'd2', 'r2'];

  const handleChange = useCallback(
    (field: keyof StrahlenschutzValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    [],
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
        {t('abstand.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('abstand.instructions')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {fieldKeys.map((field) => (
          <TextField
            key={field}
            label={tAbstand(field)}
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
          {t('calculate')}
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          {t('clear')}
        </Button>
      </Box>

      {result &&
        (() => {
          const formulaDisplay = getAbstandFormulaDisplay(
            result.field,
            values,
            result.value,
          );
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
                {tAbstand(result.field)} = {formatValue(result.value)}
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
          {t('tooFewValues', { required: 3, actual: 4 - nullCount })}
        </Typography>
      )}
      {nullCount === 0 && (
        <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
          {t('allFilled')}
        </Typography>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {t('history')}
          </Typography>
          <List dense>
            {history.map((entry, index) => {
              const fd = getAbstandFormulaDisplay(
                entry.calculatedField,
                entry,
                entry[entry.calculatedField],
              );
              return (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={t('deleteAria')}
                      onClick={() => handleDeleteHistoryEntry(index)}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={`${tAbstand(entry.calculatedField)} = ${formatValue(entry[entry.calculatedField])}`}
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

function SchutzwertRechner() {
  const t = useTranslations('schadstoff');
  const tLabels = useTranslations('schadstoff.schutzwert.labels');
  const [inputs, setInputs] = useState<Record<keyof SchutzwertValues, string>>({
    r0: '',
    r: '',
    s: '',
    n: '1',
  });
  const [history, setHistory] = useState<SchutzwertHistoryEntry[]>([]);

  const values: SchutzwertValues = useMemo(
    () => ({
      r0: parseInput(inputs.r0),
      r: parseInput(inputs.r),
      s: parseInput(inputs.s),
      n: parseInput(inputs.n),
    }),
    [inputs],
  );

  const result = useMemo(() => calculateSchutzwert(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const fieldKeys: (keyof SchutzwertValues)[] = ['r0', 'r', 's', 'n'];

  const handleChange = useCallback(
    (field: keyof SchutzwertValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    [],
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
        {t('schutzwert.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('schutzwert.instructions')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {fieldKeys.map((field) => (
          <TextField
            key={field}
            label={tLabels(field)}
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
          {t('calculate')}
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          {t('clear')}
        </Button>
      </Box>

      {result &&
        (() => {
          const formulaDisplay = getSchutzwertFormulaDisplay(
            result.field,
            values,
            result.value,
          );
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
                {tLabels(result.field)} = {formatValue(result.value)}
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
          {t('tooFewValues', { required: 3, actual: 4 - nullCount })}
        </Typography>
      )}
      {nullCount === 0 && (
        <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
          {t('allFilled')}
        </Typography>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {t('history')}
          </Typography>
          <List dense>
            {history.map((entry, index) => {
              const fd = getSchutzwertFormulaDisplay(
                entry.calculatedField,
                entry,
                entry[entry.calculatedField],
              );
              return (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={t('deleteAria')}
                      onClick={() => handleDeleteHistoryEntry(index)}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={`${tLabels(entry.calculatedField)} = ${formatValue(entry[entry.calculatedField])}`}
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

function AufenthaltszeitRechner() {
  const t = useTranslations('schadstoff');
  const tLabels = useTranslations('schadstoff.aufenthalt.labels');
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
    [inputs],
  );

  const result = useMemo(() => calculateAufenthaltszeit(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const fieldKeys: (keyof AufenthaltszeitValues)[] = ['t', 'd', 'r'];

  const handleChange = useCallback(
    (field: keyof AufenthaltszeitValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    [],
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
        {t('aufenthalt.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('aufenthalt.instructions')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
        {fieldKeys.map((field) => (
          <TextField
            key={field}
            label={tLabels(field)}
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
          {t('calculate')}
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          {t('clear')}
        </Button>
      </Box>

      {result &&
        (() => {
          const formulaDisplay = getAufenthaltszeitFormulaDisplay(
            result.field,
            values,
            result.value,
          );
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
                {tLabels(result.field)} = {formatValue(result.value)}
                {result.field === 't' && ` (${formatDuration(result.value)})`}
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
          {t('tooFewValues', { required: 2, actual: 3 - nullCount })}
        </Typography>
      )}
      {nullCount === 0 && (
        <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
          {t('allFilled')}
        </Typography>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {t('history')}
          </Typography>
          <List dense>
            {history.map((entry, index) => {
              const fd = getAufenthaltszeitFormulaDisplay(
                entry.calculatedField,
                entry,
                entry[entry.calculatedField],
              );
              return (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={t('deleteAria')}
                      onClick={() => handleDeleteHistoryEntry(index)}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={`${tLabels(entry.calculatedField)} = ${formatValue(entry[entry.calculatedField])}${entry.calculatedField === 't' ? ` (${formatDuration(entry.t)})` : ''}`}
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

// --- Dosisleistung aus Nuklid ---

function getDosisleistungNuklidFormulaDisplay(
  field: 'activity' | 'doseRate',
  gamma: number,
  activityGBq: number,
  activityInUnit: number,
  unit: ActivityUnit,
  doseRate: number,
) {
  const hStr = formatValue(doseRate);
  const gStr = formatValue(gamma);

  if (field === 'doseRate') {
    return {
      formula: `Ḣ = Γ × A`,
      substituted: `Ḣ = ${gStr} × ${formatValue(activityGBq)} = ${hStr} µSv/h`,
    };
  } else {
    return {
      formula: `A = Ḣ / Γ`,
      substituted: `A = ${hStr} / ${gStr} = ${formatValue(activityInUnit)} ${unit}`,
    };
  }
}

function DosisleistungNuklidRechner() {
  const t = useTranslations('schadstoff');
  const tNuklid = useTranslations('schadstoff.nuklid');
  const [selectedNuclide, setSelectedNuclide] = useState<string>(
    NUCLIDES[0].name,
  );
  const [activityInput, setActivityInput] = useState('');
  const [activityUnit, setActivityUnit] = useState<ActivityUnit>('GBq');
  const [doseRateInput, setDoseRateInput] = useState('');
  const [history, setHistory] = useState<DosisleistungNuklidHistoryEntry[]>([]);

  const nuclide = useMemo(
    () => NUCLIDES.find((n) => n.name === selectedNuclide) ?? NUCLIDES[0],
    [selectedNuclide],
  );

  const parsedActivity = useMemo(
    () => parseInput(activityInput),
    [activityInput],
  );
  const parsedDoseRate = useMemo(
    () => parseInput(doseRateInput),
    [doseRateInput],
  );

  const activityInGBq = useMemo(
    () =>
      parsedActivity !== null
        ? convertActivityToGBq(parsedActivity, activityUnit)
        : null,
    [parsedActivity, activityUnit],
  );

  const values: DosisleistungNuklidValues = useMemo(
    () => ({ activity: activityInGBq, doseRate: parsedDoseRate }),
    [activityInGBq, parsedDoseRate],
  );

  const result = useMemo(
    () => calculateDosisleistungNuklid(nuclide.gamma, values),
    [nuclide.gamma, values],
  );

  const handleCalculate = useCallback(() => {
    if (!result) return;
    const actGBq = result.field === 'activity' ? result.value : activityInGBq!;
    const dr = result.field === 'doseRate' ? result.value : parsedDoseRate!;
    const entry: DosisleistungNuklidHistoryEntry = {
      nuclide: nuclide.name,
      gamma: nuclide.gamma,
      activityGBq: actGBq,
      activityUnit,
      activityInUnit:
        result.field === 'activity'
          ? result.value / convertActivityToGBq(1, activityUnit)
          : parsedActivity!,
      doseRate: dr,
      calculatedField: result.field,
      timestamp: new Date(),
    };
    setHistory((prev) => [entry, ...prev]);
    if (result.field === 'doseRate') {
      setDoseRateInput(formatValue(result.value));
    } else {
      setActivityInput(
        formatValue(result.value / convertActivityToGBq(1, activityUnit)),
      );
    }
  }, [
    result,
    activityInGBq,
    parsedDoseRate,
    nuclide,
    activityUnit,
    parsedActivity,
  ]);

  const handleClear = useCallback(() => {
    setActivityInput('');
    setDoseRateInput('');
  }, []);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {tNuklid('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {tNuklid('instructions')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          select
          label={tNuklid('nuclide')}
          value={selectedNuclide}
          onChange={(e) => setSelectedNuclide(e.target.value)}
          variant="outlined"
          size="small"
        >
          {NUCLIDES.map((n) => (
            <MenuItem key={n.name} value={n.name}>
              {n.name} (Γ = {n.gamma})
            </MenuItem>
          ))}
        </TextField>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ alignSelf: 'center' }}
        >
          {tNuklid('gamma', { gamma: nuclide.gamma })}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 2,
          mt: 2,
        }}
      >
        <TextField
          label={tNuklid('activity', { unit: activityUnit })}
          value={activityInput}
          onChange={(e) => setActivityInput(e.target.value)}
          type="text"
          inputMode="decimal"
          variant="outlined"
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          select
          label={tNuklid('unit')}
          value={activityUnit}
          onChange={(e) => setActivityUnit(e.target.value as ActivityUnit)}
          variant="outlined"
          size="small"
          sx={{ minWidth: 90 }}
        >
          {ACTIVITY_UNITS.map((u) => (
            <MenuItem key={u} value={u}>
              {u}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={tNuklid('doseRate')}
          value={doseRateInput}
          onChange={(e) => setDoseRateInput(e.target.value)}
          type="text"
          inputMode="decimal"
          variant="outlined"
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          onClick={handleCalculate}
          disabled={!result}
        >
          {t('calculate')}
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          {t('clear')}
        </Button>
      </Box>

      {result &&
        (() => {
          const actGBq =
            result.field === 'activity' ? result.value : activityInGBq!;
          const actInUnit =
            result.field === 'activity'
              ? result.value / convertActivityToGBq(1, activityUnit)
              : parsedActivity!;
          const dr =
            result.field === 'doseRate' ? result.value : parsedDoseRate!;
          const fd = getDosisleistungNuklidFormulaDisplay(
            result.field,
            nuclide.gamma,
            actGBq,
            actInUnit,
            activityUnit,
            dr,
          );
          const resultLabel =
            result.field === 'doseRate'
              ? tNuklid('doseRateResult', { value: formatValue(result.value) })
              : tNuklid('activityResult', {
                  value: formatValue(actInUnit),
                  unit: activityUnit,
                });
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
              <Typography variant="h6">{resultLabel}</Typography>
              <FormulaDisplay
                formula={fd.formula}
                substituted={fd.substituted}
              />
            </Box>
          );
        })()}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {t('history')}
          </Typography>
          <List dense>
            {history.map((entry, index) => {
              const fd = getDosisleistungNuklidFormulaDisplay(
                entry.calculatedField,
                entry.gamma,
                entry.activityGBq,
                entry.activityInUnit,
                entry.activityUnit,
                entry.doseRate,
              );
              const primary =
                entry.calculatedField === 'doseRate'
                  ? `${entry.nuclide}: Ḣ = ${formatValue(entry.doseRate)} µSv/h`
                  : `${entry.nuclide}: A = ${formatValue(entry.activityInUnit)} ${entry.activityUnit}`;
              return (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={t('deleteAria')}
                      onClick={() => handleDeleteHistoryEntry(index)}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={primary}
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
  const t = useTranslations('schadstoff');
  const tEinheiten = useTranslations('schadstoff.einheiten');
  const [inputValue, setInputValue] = useState('');
  const [fromUnit, setFromUnit] = useState<RadiationUnit>('mSv');
  const [toUnit, setToUnit] = useState<RadiationUnit>('µSv');
  const [history, setHistory] = useState<ConversionHistoryEntry[]>([]);

  const compatibleUnits = useMemo(
    () => getCompatibleUnits(fromUnit),
    [fromUnit],
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
        {tEinheiten('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {tEinheiten('instructions')}
      </Typography>

      <Box
        sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <TextField
          label={tEinheiten('value')}
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
          label={tEinheiten('from')}
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
          label={tEinheiten('to')}
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
          {tEinheiten('convert')}
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
            {t('conversionHistory')}
          </Typography>
          <List dense>
            {history.map((entry, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label={t('deleteAria')}
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
  const t = useTranslations('schadstoff');
  return (
    <>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Abstandsgesetz />
        <Divider />
        <SchutzwertRechner />
        <Divider />
        <AufenthaltszeitRechner />
        <Divider />
        <DosisleistungNuklidRechner />
        <Divider />
        <Einheitenumrechnung />
      </Box>
    </>
  );
}
