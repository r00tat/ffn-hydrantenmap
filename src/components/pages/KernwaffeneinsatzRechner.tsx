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
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  calculateFallout,
  calculateFalloutR1,
  FALLOUT_DECAY_EXPONENT,
  FalloutHistoryEntry,
  FalloutR1HistoryEntry,
  FalloutR1Values,
  FalloutValues,
} from '../../common/strahlenschutz';
import KernwaffenNomogramm from './KernwaffenNomogramm';

function parseInput(value: string): number | null {
  if (value.trim() === '') return null;
  const num = parseFloat(value.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function formatValue(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

/** Combine hours + minutes string inputs into decimal hours, or null if both empty. */
function combineHm(hStr: string, mStr: string): number | null {
  const h = parseInput(hStr);
  const m = parseInput(mStr);
  if (h === null && m === null) return null;
  return (h ?? 0) + (m ?? 0) / 60;
}

/** Split decimal hours into integer hours and remaining minutes. */
function splitHm(decHours: number): { h: number; m: number } {
  const totalSec = Math.round(decHours * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec - h * 3600) / 60);
  if (m === 60) return { h: h + 1, m: 0 };
  return { h, m };
}

function formatHm(decHours: number): string {
  const { h, m } = splitHm(decHours);
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

// ============ Main Kernwaffeneinsatz Rechner ============

interface MainInputs {
  teH: string;
  teMin: string;
  tsH: string;
  tsMin: string;
  r1: string;
  d: string;
}

function getFalloutFormulaDisplay(
  field: keyof FalloutValues,
  values: { r1: number; te: number; ts: number; d: number }
) {
  const v = formatValue;
  switch (field) {
    case 'd':
      return {
        formula: 'D = 5 · R₁ · ( Te^(-0,2) − (Te+Ts)^(-0,2) )',
        substituted: `D = 5 · ${v(values.r1)} · ( ${v(values.te)}^(-0,2) − ${v(values.te + values.ts)}^(-0,2) ) = ${v(values.d)} mSv`,
      };
    case 'r1':
      return {
        formula: 'R₁ = D / ( 5 · ( Te^(-0,2) − (Te+Ts)^(-0,2) ) )',
        substituted: `R₁ = ${v(values.d)} / ( 5 · ( ${v(values.te)}^(-0,2) − ${v(values.te + values.ts)}^(-0,2) ) ) = ${v(values.r1)} mSv/h`,
      };
    case 'ts':
      return {
        formula: 'Ts = ( Te^(-0,2) − D/(5·R₁) )^(-5) − Te',
        substituted: `Ts = ( ${v(values.te)}^(-0,2) − ${v(values.d)}/(5·${v(values.r1)}) )^(-5) − ${v(values.te)} = ${v(values.ts)} h`,
      };
    case 'te':
      return {
        formula: 'Te numerisch aus  5·R₁·( Te^(-0,2) − (Te+Ts)^(-0,2) ) = D',
        substituted: `5·${v(values.r1)}·( Te^(-0,2) − (Te+${v(values.ts)})^(-0,2) ) = ${v(values.d)}  →  Te = ${v(values.te)} h`,
      };
  }
}

export function KernwaffeneinsatzRechner() {
  const tShared = useTranslations('schadstoff');
  const t = useTranslations('schadstoff.kernwaffen');
  const [inputs, setInputs] = useState<MainInputs>({
    teH: '',
    teMin: '',
    tsH: '',
    tsMin: '',
    r1: '',
    d: '',
  });
  const [history, setHistory] = useState<FalloutHistoryEntry[]>([]);

  const te = useMemo(() => combineHm(inputs.teH, inputs.teMin), [inputs]);
  const ts = useMemo(() => combineHm(inputs.tsH, inputs.tsMin), [inputs]);
  const r1 = useMemo(() => parseInput(inputs.r1), [inputs.r1]);
  const d = useMemo(() => parseInput(inputs.d), [inputs.d]);

  const values: FalloutValues = useMemo(
    () => ({ r1, te, ts, d }),
    [r1, te, ts, d],
  );

  const result = useMemo(() => calculateFallout(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const handleChange = useCallback(
    (field: keyof MainInputs) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    [],
  );

  const handleCalculate = useCallback(() => {
    if (!result) return;
    const final = {
      r1: result.field === 'r1' ? result.value : r1!,
      te: result.field === 'te' ? result.value : te!,
      ts: result.field === 'ts' ? result.value : ts!,
      d: result.field === 'd' ? result.value : d!,
    };
    const entry: FalloutHistoryEntry = {
      ...final,
      calculatedField: result.field,
      timestamp: new Date(),
    };
    setHistory((prev) => [entry, ...prev]);

    // Update inputs to reflect the computed value
    if (result.field === 'd') {
      setInputs((prev) => ({ ...prev, d: formatValue(result.value) }));
    } else if (result.field === 'r1') {
      setInputs((prev) => ({ ...prev, r1: formatValue(result.value) }));
    } else if (result.field === 'te') {
      const { h, m } = splitHm(result.value);
      setInputs((prev) => ({ ...prev, teH: String(h), teMin: String(m) }));
    } else if (result.field === 'ts') {
      const { h, m } = splitHm(result.value);
      setInputs((prev) => ({ ...prev, tsH: String(h), tsMin: String(m) }));
    }
  }, [result, r1, te, ts, d]);

  const handleClear = useCallback(() => {
    setInputs({ teH: '', teMin: '', tsH: '', tsMin: '', r1: '', d: '' });
  }, []);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Live values for nomogram preview (use computed result if available)
  const nomR1 = result && result.field === 'r1' ? result.value : r1;
  const nomTe = result && result.field === 'te' ? result.value : te;
  const nomTs = result && result.field === 'ts' ? result.value : ts;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('instructions')}
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t('te')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            <TextField
              label={t('hours')}
              value={inputs.teH}
              onChange={handleChange('teH')}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={t('minutes')}
              value={inputs.teMin}
              onChange={handleChange('teMin')}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
          </Box>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t('ts')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            <TextField
              label={t('hours')}
              value={inputs.tsH}
              onChange={handleChange('tsH')}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={t('minutes')}
              value={inputs.tsMin}
              onChange={handleChange('tsMin')}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
          </Box>
        </Box>
        <TextField
          label={t('r1')}
          value={inputs.r1}
          onChange={handleChange('r1')}
          type="text"
          inputMode="decimal"
          variant="outlined"
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('d')}
          value={inputs.d}
          onChange={handleChange('d')}
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
          {tShared('calculate')}
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          {tShared('clear')}
        </Button>
      </Box>

      {result &&
        (() => {
          const final = {
            r1: result.field === 'r1' ? result.value : r1!,
            te: result.field === 'te' ? result.value : te!,
            ts: result.field === 'ts' ? result.value : ts!,
            d: result.field === 'd' ? result.value : d!,
          };
          const fd = getFalloutFormulaDisplay(result.field, final);
          const v = formatValue(result.value);
          const hm = formatHm(result.value);
          const label =
            result.field === 'd'
              ? t('resultD', { value: v })
              : result.field === 'r1'
                ? t('resultR1', { value: v })
                : result.field === 'te'
                  ? t('resultTe', { value: v, hm })
                  : t('resultTs', { value: v, hm });
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
              <Typography variant="h6">{label}</Typography>
              <Box sx={{ mt: 1, fontFamily: 'monospace' }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {fd.formula}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {fd.substituted}
                </Typography>
              </Box>
            </Box>
          );
        })()}

      {nullCount !== 1 && nullCount > 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          {t('tooFewValues', { actual: 4 - nullCount })}
        </Typography>
      )}
      {nullCount === 0 && (
        <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
          {tShared('allFilled')}
        </Typography>
      )}

      <KernwaffenNomogramm r1={nomR1} te={nomTe} ts={nomTs} />

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {tShared('history')}
          </Typography>
          <List dense>
            {history.map((entry, index) => {
              const fd = getFalloutFormulaDisplay(entry.calculatedField, {
                r1: entry.r1,
                te: entry.te,
                ts: entry.ts,
                d: entry.d,
              });
              const primary =
                entry.calculatedField === 'd'
                  ? t('resultD', { value: formatValue(entry.d) })
                  : entry.calculatedField === 'r1'
                    ? t('resultR1', { value: formatValue(entry.r1) })
                    : entry.calculatedField === 'te'
                      ? t('resultTe', {
                          value: formatValue(entry.te),
                          hm: formatHm(entry.te),
                        })
                      : t('resultTs', {
                          value: formatValue(entry.ts),
                          hm: formatHm(entry.ts),
                        });
              return (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={tShared('deleteAria')}
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

// ============ R₁ aus Messung Rechner ============

interface R1Inputs {
  rt: string;
  tH: string;
  tMin: string;
  r1: string;
}

function getR1FormulaDisplay(
  field: keyof FalloutR1Values,
  values: { r1: number; rt: number; t: number }
) {
  const v = formatValue;
  switch (field) {
    case 'r1':
      return {
        formula: 'R₁ = R(t) · t^1,2',
        substituted: `R₁ = ${v(values.rt)} · ${v(values.t)}^1,2 = ${v(values.r1)} mSv/h`,
      };
    case 'rt':
      return {
        formula: 'R(t) = R₁ · t^(-1,2)',
        substituted: `R(t) = ${v(values.r1)} · ${v(values.t)}^(-1,2) = ${v(values.rt)} mSv/h`,
      };
    case 't':
      return {
        formula: 't = ( R₁ / R(t) )^(1/1,2)',
        substituted: `t = ( ${v(values.r1)} / ${v(values.rt)} )^(1/1,2) = ${v(values.t)} h`,
      };
  }
}

export function BezugsdosisleistungRechner() {
  const tShared = useTranslations('schadstoff');
  const t = useTranslations('schadstoff.bezugsdosisleistung');
  const [inputs, setInputs] = useState<R1Inputs>({
    rt: '',
    tH: '',
    tMin: '',
    r1: '',
  });
  const [history, setHistory] = useState<FalloutR1HistoryEntry[]>([]);

  const rt = useMemo(() => parseInput(inputs.rt), [inputs.rt]);
  const tVal = useMemo(() => combineHm(inputs.tH, inputs.tMin), [inputs]);
  const r1 = useMemo(() => parseInput(inputs.r1), [inputs.r1]);

  const values: FalloutR1Values = useMemo(
    () => ({ r1, rt, t: tVal }),
    [r1, rt, tVal],
  );

  const result = useMemo(() => calculateFalloutR1(values), [values]);
  const nullCount = Object.values(values).filter((v) => v === null).length;

  const handleChange = useCallback(
    (field: keyof R1Inputs) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputs((prev) => ({ ...prev, [field]: event.target.value }));
      },
    [],
  );

  const handleCalculate = useCallback(() => {
    if (!result) return;
    const final = {
      r1: result.field === 'r1' ? result.value : r1!,
      rt: result.field === 'rt' ? result.value : rt!,
      t: result.field === 't' ? result.value : tVal!,
    };
    const entry: FalloutR1HistoryEntry = {
      ...final,
      calculatedField: result.field,
      timestamp: new Date(),
    };
    setHistory((prev) => [entry, ...prev]);

    if (result.field === 'r1') {
      setInputs((prev) => ({ ...prev, r1: formatValue(result.value) }));
    } else if (result.field === 'rt') {
      setInputs((prev) => ({ ...prev, rt: formatValue(result.value) }));
    } else if (result.field === 't') {
      const { h, m } = splitHm(result.value);
      setInputs((prev) => ({ ...prev, tH: String(h), tMin: String(m) }));
    }
  }, [result, r1, rt, tVal]);

  const handleClear = useCallback(() => {
    setInputs({ rt: '', tH: '', tMin: '', r1: '' });
  }, []);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('instructions', { exp: FALLOUT_DECAY_EXPONENT })}
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
          gap: 2,
        }}
      >
        <TextField
          label={t('rt')}
          value={inputs.rt}
          onChange={handleChange('rt')}
          type="text"
          inputMode="decimal"
          variant="outlined"
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t('t')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            <TextField
              label={t('hours')}
              value={inputs.tH}
              onChange={handleChange('tH')}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={t('minutes')}
              value={inputs.tMin}
              onChange={handleChange('tMin')}
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
          </Box>
        </Box>
        <TextField
          label={t('r1')}
          value={inputs.r1}
          onChange={handleChange('r1')}
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
          {tShared('calculate')}
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          {tShared('clear')}
        </Button>
      </Box>

      {result &&
        (() => {
          const final = {
            r1: result.field === 'r1' ? result.value : r1!,
            rt: result.field === 'rt' ? result.value : rt!,
            t: result.field === 't' ? result.value : tVal!,
          };
          const fd = getR1FormulaDisplay(result.field, final);
          const v = formatValue(result.value);
          const label =
            result.field === 'r1'
              ? t('resultR1', { value: v })
              : result.field === 'rt'
                ? t('resultRt', { value: v })
                : t('resultT', { value: v, hm: formatHm(result.value) });
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
              <Typography variant="h6">{label}</Typography>
              <Box sx={{ mt: 1, fontFamily: 'monospace' }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {fd.formula}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {fd.substituted}
                </Typography>
              </Box>
            </Box>
          );
        })()}

      {nullCount !== 1 && nullCount > 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          {t('tooFewValues', { actual: 3 - nullCount })}
        </Typography>
      )}
      {nullCount === 0 && (
        <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
          {tShared('allFilled')}
        </Typography>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {tShared('history')}
          </Typography>
          <List dense>
            {history.map((entry, index) => {
              const fd = getR1FormulaDisplay(entry.calculatedField, {
                r1: entry.r1,
                rt: entry.rt,
                t: entry.t,
              });
              const primary =
                entry.calculatedField === 'r1'
                  ? t('resultR1', { value: formatValue(entry.r1) })
                  : entry.calculatedField === 'rt'
                    ? t('resultRt', { value: formatValue(entry.rt) })
                    : t('resultT', {
                        value: formatValue(entry.t),
                        hm: formatHm(entry.t),
                      });
              return (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={tShared('deleteAria')}
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
