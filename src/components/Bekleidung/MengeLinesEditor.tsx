'use client';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { chargeKey, type BekleidungBestand } from '../../common/bekleidung';
import type { MengeLine } from './bekleidungActions';
import { chargenInStock, knownSizes, type BekleidungView } from './bekleidungUi';

export interface MengeLineDraft {
  key: number;
  artikelId: string;
  groesse: string;
  menge: string;
  /** Gewählte Charge als `chargeKey`, `NO_CHARGE` für Bestand ohne Charge. */
  charge?: string;
}

const NO_CHARGE = '\u0000';

export function emptyMengeLine(key: number): MengeLineDraft {
  return { key, artikelId: '', groesse: '', menge: '1' };
}

/**
 * Charge einer Zeile: die gewählte, sonst die einzige mit Bestand.
 * `null` heißt: mehrere Chargen auf Lager, aber noch keine gewählt.
 */
function resolveCharge(
  line: MengeLineDraft,
  bestand: BekleidungBestand[],
): { charge?: string; anzahl: number } | null | undefined {
  const options = chargenInStock(line.artikelId, line.groesse, bestand);
  if (options.length <= 1) return options[0];
  if (line.charge === undefined) return null;
  return options.find((o) => (o.charge ? chargeKey(o.charge) : NO_CHARGE) === line.charge) ?? null;
}

/**
 * Vollständige Zeilen für die Server Action. Eine Zeile, bei der die Charge
 * noch zu wählen ist, fehlt — die Ausgabe bleibt dann gesperrt.
 */
export function completeMengeLines(
  lines: MengeLineDraft[],
  bestand: BekleidungBestand[],
): MengeLine[] {
  const result: MengeLine[] = [];
  for (const l of lines) {
    const groesse = l.groesse.trim();
    const menge = Number(l.menge);
    if (!l.artikelId || !groesse || !Number.isInteger(menge) || menge <= 0) continue;
    const resolved = resolveCharge(l, bestand);
    if (resolved === null) continue;
    result.push({
      artikelId: l.artikelId,
      groesse,
      ...(resolved?.charge ? { charge: resolved.charge } : {}),
      menge,
    });
  }
  return result;
}

/** Zeilen, bei denen noch eine Charge zu wählen ist. */
export function linesMissingCharge(lines: MengeLineDraft[], bestand: BekleidungBestand[]): number {
  return lines.filter((l) => l.artikelId && l.groesse.trim() && resolveCharge(l, bestand) === null)
    .length;
}

/** Mengenartikel mit Größe und Anzahl — für die Ausgabe. */
export default function MengeLinesEditor({
  view,
  lines,
  onChange,
}: {
  view: BekleidungView;
  lines: MengeLineDraft[];
  onChange: (lines: MengeLineDraft[]) => void;
}) {
  const t = useTranslations('bekleidung');
  const mengeArtikel = useMemo(
    () => view.artikel.filter((a) => a.fuehrung === 'menge' && a.aktiv),
    [view.artikel],
  );

  const update = (key: number, patch: Partial<MengeLineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** Bestand der gewählten Charge, ohne Wahl die Summe aller Chargen. */
  const stockOf = (line: MengeLineDraft) => {
    const resolved = resolveCharge(line, view.bestand);
    if (resolved) return resolved.anzahl;
    return chargenInStock(line.artikelId, line.groesse, view.bestand).reduce(
      (sum, o) => sum + o.anzahl,
      0,
    );
  };

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t('ausgabe.mengen')}</Typography>
      {lines.map((line) => {
        const chargen =
          line.artikelId && line.groesse.trim()
            ? chargenInStock(line.artikelId, line.groesse, view.bestand)
            : [];
        return (
          <Stack
            key={line.key}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'flex-start' } }}
          >
            <TextField
              select
              size="small"
              label={t('fields.artikel')}
              value={line.artikelId}
              onChange={(e) => update(line.key, { artikelId: e.target.value, charge: undefined })}
              sx={{ minWidth: 180, flexGrow: 1 }}
            >
              {mengeArtikel.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.bezeichnung}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete
              freeSolo
              size="small"
              options={line.artikelId ? knownSizes(line.artikelId, view.bestand) : []}
              inputValue={line.groesse}
              onInputChange={(_, value) => update(line.key, { groesse: value, charge: undefined })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('fields.groesse')}
                  helperText={
                    line.artikelId && line.groesse.trim()
                      ? t('ausgabe.available', { count: stockOf(line) })
                      : undefined
                  }
                />
              )}
              sx={{ minWidth: 120 }}
            />
            {chargen.length > 1 && (
              <TextField
                select
                size="small"
                label={t('fields.charge')}
                value={line.charge ?? ''}
                error={line.charge === undefined}
                helperText={line.charge === undefined ? t('ausgabe.chargeRequired') : undefined}
                onChange={(e) => update(line.key, { charge: e.target.value })}
                sx={{ minWidth: 160 }}
              >
                {chargen.map((o) => (
                  <MenuItem
                    key={o.charge ?? NO_CHARGE}
                    value={o.charge ? chargeKey(o.charge) : NO_CHARGE}
                  >
                    {t('ausgabe.chargeOption', {
                      charge: o.charge ?? t('ausgabe.noCharge'),
                      count: o.anzahl,
                    })}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              size="small"
              type="number"
              label={t('fields.menge')}
              value={line.menge}
              onChange={(e) => update(line.key, { menge: e.target.value })}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              sx={{ width: 100 }}
            />
            <IconButton
              aria-label={t('actions.remove')}
              onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        );
      })}
      <div>
        <Button
          size="small"
          startIcon={<AddIcon />}
          disabled={mengeArtikel.length === 0}
          onClick={() =>
            onChange([...lines, emptyMengeLine(Math.max(0, ...lines.map((l) => l.key)) + 1)])
          }
        >
          {t('ausgabe.addMenge')}
        </Button>
      </div>
    </Stack>
  );
}
