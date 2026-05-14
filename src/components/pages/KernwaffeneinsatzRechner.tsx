'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  calculateFallout,
  calculateFalloutR1,
  FALLOUT_DECAY_EXPONENT,
  FalloutR1Values,
  FalloutValues,
  formatDuration,
  parseDuration,
} from '../../common/strahlenschutz';
import DosisleistungsNomogramm from './DosisleistungsNomogramm';
import KernwaffenNomogramm from './KernwaffenNomogramm';

function parseNumber(value: string): number | null {
  const s = value.trim();
  if (s === '') return null;
  const num = parseFloat(s.replace(',', '.'));
  if (isNaN(num) || num <= 0) return null;
  return num;
}

function formatValue(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

interface ResultBlockProps {
  label: string;
  formula: string;
  substituted: string;
}

function ResultBlock({ label, formula, substituted }: ResultBlockProps) {
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
          {formula}
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {substituted}
        </Typography>
      </Box>
    </Box>
  );
}

// ===== Section 1: R₁ (Bezugsdosisleistung) =====

interface R1Inputs {
  r1: string;
  rt: string;
  t: string;
}

function describeR1Result(
  field: keyof FalloutR1Values,
  r1: number,
  rt: number,
  t: number,
) {
  const v = formatValue;
  switch (field) {
    case 'r1':
      return {
        formula: 'R₁ = R(t) · t^1,2',
        substituted: `R₁ = ${v(rt)} · ${v(t)}^1,2 = ${v(r1)} mSv/h`,
      };
    case 'rt':
      return {
        formula: 'R(t) = R₁ · t^(-1,2)',
        substituted: `R(t) = ${v(r1)} · ${v(t)}^(-1,2) = ${v(rt)} mSv/h`,
      };
    case 't':
      return {
        formula: 't = ( R₁ / R(t) )^(1/1,2)',
        substituted: `t = ( ${v(r1)} / ${v(rt)} )^(1/1,2) = ${v(t)} h`,
      };
  }
}

// ===== Main Workflow =====

export function KernwaffeneinsatzRechner() {
  const tShared = useTranslations('schadstoff');
  const t = useTranslations('schadstoff.kernwaffen');

  // Section 1: R₁ inputs
  const [s1, setS1] = useState<R1Inputs>({ r1: '', rt: '', t: '' });

  // Section 2: dose rate at other time
  const [s2, setS2] = useState({ tPrime: '', rPrime: '' });

  // Section 3: total dose
  const [s3, setS3] = useState({ te: '', ts: '', d: '' });

  // === Parse & compute ===

  const s1Parsed: FalloutR1Values = useMemo(
    () => ({
      r1: parseNumber(s1.r1),
      rt: parseNumber(s1.rt),
      t: parseDuration(s1.t),
    }),
    [s1],
  );

  const s1Result = useMemo(
    () => calculateFalloutR1(s1Parsed),
    [s1Parsed],
  );

  // Effective R₁: either entered directly, or computed from rt+t
  const r1Effective = useMemo<number | null>(() => {
    if (s1Parsed.r1 !== null) return s1Parsed.r1;
    if (s1Result && s1Result.field === 'r1') return s1Result.value;
    return null;
  }, [s1Parsed.r1, s1Result]);

  const s2Parsed: FalloutR1Values = useMemo(
    () => ({
      r1: r1Effective,
      rt: parseNumber(s2.rPrime),
      t: parseDuration(s2.tPrime),
    }),
    [r1Effective, s2],
  );

  const s2Result = useMemo(
    () => calculateFalloutR1(s2Parsed),
    [s2Parsed],
  );

  const s3Parsed: FalloutValues = useMemo(
    () => ({
      r1: r1Effective,
      te: parseDuration(s3.te),
      ts: parseDuration(s3.ts),
      d: parseNumber(s3.d),
    }),
    [r1Effective, s3],
  );

  const s3Result = useMemo(() => calculateFallout(s3Parsed), [s3Parsed]);

  // === Handlers ===

  const onChange1 = useCallback(
    (field: keyof R1Inputs) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setS1((p) => ({ ...p, [field]: e.target.value }));
      },
    [],
  );
  const onChange2 = useCallback(
    (field: 'tPrime' | 'rPrime') =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setS2((p) => ({ ...p, [field]: e.target.value }));
      },
    [],
  );
  const onChange3 = useCallback(
    (field: 'te' | 'ts' | 'd') =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setS3((p) => ({ ...p, [field]: e.target.value }));
      },
    [],
  );

  const handleClearAll = useCallback(() => {
    setS1({ r1: '', rt: '', t: '' });
    setS2({ tPrime: '', rPrime: '' });
    setS3({ te: '', ts: '', d: '' });
  }, []);

  // === Live nomogram values (use computed if input field empty) ===
  const nomR1 = r1Effective;
  const nomR1IsComputed =
    s1Parsed.r1 === null && s1Result?.field === 'r1';

  const nomRtMeas =
    s1Parsed.rt !== null
      ? s1Parsed.rt
      : s1Result?.field === 'rt'
        ? s1Result.value
        : null;
  const nomRtMeasIsComputed =
    s1Parsed.rt === null && s1Result?.field === 'rt';

  const nomTMeas =
    s1Parsed.t !== null
      ? s1Parsed.t
      : s1Result?.field === 't'
        ? s1Result.value
        : null;
  const nomTMeasIsComputed =
    s1Parsed.t === null && s1Result?.field === 't';

  const nomRtPrime =
    s2Parsed.rt !== null
      ? s2Parsed.rt
      : s2Result?.field === 'rt'
        ? s2Result.value
        : null;
  const nomRtPrimeIsComputed =
    s2Parsed.rt === null && s2Result?.field === 'rt';

  const nomTPrime =
    s2Parsed.t !== null
      ? s2Parsed.t
      : s2Result?.field === 't'
        ? s2Result.value
        : null;
  const nomTPrimeIsComputed =
    s2Parsed.t === null && s2Result?.field === 't';

  const nomTe =
    s3Parsed.te ??
    (s3Result && s3Result.field === 'te' ? s3Result.value : null);
  const nomTs =
    s3Parsed.ts ??
    (s3Result && s3Result.field === 'ts' ? s3Result.value : null);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('workflowIntro')}
      </Typography>

      {/* ===== Section 1: R₁ from measurement or direct ===== */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t('section1Title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('section1Instructions', { exp: FALLOUT_DECAY_EXPONENT })}
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
            value={s1.rt}
            onChange={onChange1('rt')}
            type="text"
            inputMode="decimal"
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label={t('tDuration')}
            value={s1.t}
            onChange={onChange1('t')}
            type="text"
            placeholder={t('durationPlaceholder')}
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={
              s1Parsed.t !== null ? formatDuration(s1Parsed.t) : undefined
            }
          />
          <TextField
            label={t('r1')}
            value={s1.r1}
            onChange={onChange1('r1')}
            type="text"
            inputMode="decimal"
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>

        {s1Result &&
          (() => {
            const r1Val =
              s1Result.field === 'r1' ? s1Result.value : s1Parsed.r1!;
            const rtVal =
              s1Result.field === 'rt' ? s1Result.value : s1Parsed.rt!;
            const tVal =
              s1Result.field === 't' ? s1Result.value : s1Parsed.t!;
            const fd = describeR1Result(s1Result.field, r1Val, rtVal, tVal);
            const label =
              s1Result.field === 'r1'
                ? t('resultR1', { value: formatValue(s1Result.value) })
                : s1Result.field === 'rt'
                  ? t('resultRt', { value: formatValue(s1Result.value) })
                  : t('resultT', {
                      value: formatValue(s1Result.value),
                      hm: formatDuration(s1Result.value),
                    });
            return (
              <ResultBlock
                label={label}
                formula={fd.formula}
                substituted={fd.substituted}
              />
            );
          })()}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* ===== Section 2: Dose rate at other time ===== */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          {t('section2Title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {r1Effective !== null
            ? t('section2Instructions', { r1: formatValue(r1Effective) })
            : t('section2NoR1')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
          }}
        >
          <TextField
            label={t('tPrimeDuration')}
            value={s2.tPrime}
            onChange={onChange2('tPrime')}
            type="text"
            placeholder={t('durationPlaceholder')}
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={
              s2Parsed.t !== null ? formatDuration(s2Parsed.t) : undefined
            }
            disabled={r1Effective === null}
          />
          <TextField
            label={t('rPrime')}
            value={s2.rPrime}
            onChange={onChange2('rPrime')}
            type="text"
            inputMode="decimal"
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            disabled={r1Effective === null}
          />
        </Box>

        {s2Result &&
          r1Effective !== null &&
          (() => {
            const rt =
              s2Result.field === 'rt' ? s2Result.value : s2Parsed.rt!;
            const tv =
              s2Result.field === 't' ? s2Result.value : s2Parsed.t!;
            const fd = describeR1Result(s2Result.field, r1Effective, rt, tv);
            const label =
              s2Result.field === 'rt'
                ? t('resultRt', { value: formatValue(s2Result.value) })
                : t('resultT', {
                    value: formatValue(s2Result.value),
                    hm: formatDuration(s2Result.value),
                  });
            return (
              <ResultBlock
                label={label}
                formula={fd.formula}
                substituted={fd.substituted}
              />
            );
          })()}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* ===== Section 3: Total dose ===== */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          {t('section3Title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {r1Effective !== null
            ? t('section3Instructions', { r1: formatValue(r1Effective) })
            : t('section3NoR1')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
            gap: 2,
          }}
        >
          <TextField
            label={t('te')}
            value={s3.te}
            onChange={onChange3('te')}
            type="text"
            placeholder={t('durationPlaceholder')}
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={
              s3Parsed.te !== null ? formatDuration(s3Parsed.te) : undefined
            }
            disabled={r1Effective === null}
          />
          <TextField
            label={t('ts')}
            value={s3.ts}
            onChange={onChange3('ts')}
            type="text"
            placeholder={t('durationPlaceholder')}
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={
              s3Parsed.ts !== null ? formatDuration(s3Parsed.ts) : undefined
            }
            disabled={r1Effective === null}
          />
          <TextField
            label={t('d')}
            value={s3.d}
            onChange={onChange3('d')}
            type="text"
            inputMode="decimal"
            variant="outlined"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            disabled={r1Effective === null}
          />
        </Box>

        {s3Result &&
          r1Effective !== null &&
          (() => {
            const teV =
              s3Result.field === 'te' ? s3Result.value : s3Parsed.te!;
            const tsV =
              s3Result.field === 'ts' ? s3Result.value : s3Parsed.ts!;
            const dV =
              s3Result.field === 'd' ? s3Result.value : s3Parsed.d!;
            const v = formatValue;
            const formula =
              s3Result.field === 'd'
                ? {
                    formula: 'D = 5 · R₁ · ( Te^(-0,2) − (Te+Ts)^(-0,2) )',
                    substituted: `D = 5 · ${v(r1Effective)} · ( ${v(teV)}^(-0,2) − ${v(teV + tsV)}^(-0,2) ) = ${v(dV)} mSv`,
                  }
                : s3Result.field === 'ts'
                  ? {
                      formula: 'Ts = ( Te^(-0,2) − D/(5·R₁) )^(-5) − Te',
                      substituted: `Ts = ( ${v(teV)}^(-0,2) − ${v(dV)}/(5·${v(r1Effective)}) )^(-5) − ${v(teV)} = ${v(tsV)} h`,
                    }
                  : s3Result.field === 'te'
                    ? {
                        formula:
                          'Te numerisch aus  5·R₁·( Te^(-0,2) − (Te+Ts)^(-0,2) ) = D',
                        substituted: `5·${v(r1Effective)}·( Te^(-0,2) − (Te+${v(tsV)})^(-0,2) ) = ${v(dV)}  →  Te = ${v(teV)} h`,
                      }
                    : {
                        formula:
                          'R₁ = D / ( 5 · ( Te^(-0,2) − (Te+Ts)^(-0,2) ) )',
                        substituted: `R₁ = ${v(dV)} / ( 5 · ( ${v(teV)}^(-0,2) − ${v(teV + tsV)}^(-0,2) ) ) = ${v(r1Effective)} mSv/h`,
                      };
            const label =
              s3Result.field === 'd'
                ? t('resultD', { value: formatValue(s3Result.value) })
                : s3Result.field === 'te'
                  ? t('resultTe', {
                      value: formatValue(s3Result.value),
                      hm: formatDuration(s3Result.value),
                    })
                  : t('resultTs', {
                      value: formatValue(s3Result.value),
                      hm: formatDuration(s3Result.value),
                    });
            return (
              <ResultBlock
                label={label}
                formula={formula.formula}
                substituted={formula.substituted}
              />
            );
          })()}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <Button variant="outlined" onClick={handleClearAll}>
          {tShared('clear')}
        </Button>
      </Box>

      {/* Nomogramm (live preview) */}
      {/* Live-Nomogramme (Phase 2: rechtes Dosis-Nomogramm wird später überarbeitet) */}
      <DosisleistungsNomogramm
        r1={nomR1}
        r1IsComputed={nomR1IsComputed}
        rtMeas={nomRtMeas}
        rtMeasIsComputed={nomRtMeasIsComputed}
        tMeas={nomTMeas}
        tMeasIsComputed={nomTMeasIsComputed}
        rtPrime={nomRtPrime}
        rtPrimeIsComputed={nomRtPrimeIsComputed}
        tPrime={nomTPrime}
        tPrimeIsComputed={nomTPrimeIsComputed}
      />
      <KernwaffenNomogramm r1={nomR1} te={nomTe} ts={nomTs} />
    </Box>
  );
}
