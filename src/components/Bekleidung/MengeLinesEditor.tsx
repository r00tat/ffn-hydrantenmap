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
import { normalizeGroesse } from '../../common/bekleidung';
import { knownSizes, type BekleidungView } from './bekleidungUi';

export interface MengeLineDraft {
  key: number;
  artikelId: string;
  groesse: string;
  menge: string;
}

export function emptyMengeLine(key: number): MengeLineDraft {
  return { key, artikelId: '', groesse: '', menge: '1' };
}

/** Vollständige Zeilen für die Server Action. */
export function completeMengeLines(lines: MengeLineDraft[]) {
  return lines
    .map((l) => ({ artikelId: l.artikelId, groesse: l.groesse.trim(), menge: Number(l.menge) }))
    .filter((l) => l.artikelId && l.groesse && Number.isInteger(l.menge) && l.menge > 0);
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

  const stockOf = (artikelId: string, groesse: string) =>
    view.bestand.find(
      (b) => b.artikelId === artikelId && normalizeGroesse(b.groesse) === normalizeGroesse(groesse),
    )?.anzahl ?? 0;

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t('ausgabe.mengen')}</Typography>
      {lines.map((line) => (
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
            onChange={(e) => update(line.key, { artikelId: e.target.value })}
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
            onInputChange={(_, value) => update(line.key, { groesse: value })}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('fields.groesse')}
                helperText={
                  line.artikelId && line.groesse.trim()
                    ? t('ausgabe.available', { count: stockOf(line.artikelId, line.groesse) })
                    : undefined
                }
              />
            )}
            sx={{ minWidth: 120 }}
          />
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
      ))}
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
