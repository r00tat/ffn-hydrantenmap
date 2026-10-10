'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { BekleidungKategorie, BekleidungStatus } from '../../common/bekleidung';
import {
  importRowRef,
  type ImportPreview,
  type ImportRow,
  type ImportRowDecision,
} from '../../common/bekleidungImport';

const STATUSES: BekleidungStatus[] = ['lager', 'ausgegeben', 'ausgeschieden', 'nicht_auffindbar'];

type RowRef = { sheet: BekleidungKategorie; rowNumber: number };

const blockName = (b: ImportRow['ausgaben'][number]) => `${b.vorname} ${b.nachname}`.trim();

/** Index des Blocks, der ohne Entscheidung offen bliebe: der letzte offene. */
function lastOpenIndex(row: ImportRow): number | undefined {
  for (let i = row.ausgaben.length - 1; i >= 0; i--) {
    if (!row.ausgaben[i].zurueckAm) return i;
  }
  return undefined;
}

/**
 * Bereinigung der Vorschau: doppelte Tag-Nummern umbenennen oder ohne
 * Nummer führen, bei Statuskonflikten Status und offene Ausgabe wählen.
 * Vorbelegt ist, was der Import ohne Eingriff täte; jede Änderung landet als
 * Bemerkung mit dem Excel-Wert am Stück.
 */
export default function ImportCleanupSection({
  preview,
  rows,
  collisions,
  onChange,
}: {
  preview: ImportPreview;
  rows: Record<string, ImportRowDecision>;
  collisions: string[];
  onChange: (ref: string, patch: ImportRowDecision) => void;
}) {
  const t = useTranslations('bekleidung');
  const rowByRef = useMemo(
    () => new Map(preview.rows.map((r) => [importRowRef(r), r])),
    [preview.rows],
  );
  const rowLabel = (r: RowRef) =>
    t('import.row', { sheet: t(`kategorie.${r.sheet}`), row: r.rowNumber });

  /** Kurzbeschreibung einer Zeile, damit man ohne Excel entscheiden kann. */
  const describe = (row: ImportRow) => {
    const last = row.ausgaben[row.ausgaben.length - 1];
    return [
      [row.art, row.hersteller].filter(Boolean).join(' '),
      row.groesse,
      t(`status.${row.status}`),
      last ? t('import.lastPerson', { name: blockName(last) }) : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const tagValue = (row: ImportRow) => {
    const decision = rows[importRowRef(row)];
    if (decision?.tagNummer === null) return '';
    return decision?.tagNummer ?? row.tagNummer ?? '';
  };

  return (
    <>
      {preview.duplicateTags.length > 0 && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>
              {t('import.duplicatesSection', { count: preview.duplicateTags.length })}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('import.duplicatesHint')}
            </Typography>
            <Stack spacing={2}>
              {preview.duplicateTags.map((d) => (
                <Stack key={d.tagNummer} spacing={1}>
                  <Typography variant="subtitle2">{d.tagNummer}</Typography>
                  {d.rowNumbers.map((ref) => {
                    const key = importRowRef(ref);
                    const row = rowByRef.get(key);
                    if (!row) return null;
                    const value = tagValue(row);
                    const collides = !!value && collisions.includes(value.trim());
                    return (
                      <Stack
                        key={key}
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        sx={{ alignItems: { sm: 'center' } }}
                      >
                        <Typography variant="body2" sx={{ flexGrow: 1 }}>
                          {rowLabel(ref)}: {describe(row)}
                        </Typography>
                        <TextField
                          size="small"
                          label={t('import.tagLabel', { row: rowLabel(ref) })}
                          value={value}
                          error={collides}
                          helperText={value ? undefined : t('import.noTag')}
                          onChange={(e) =>
                            onChange(key, {
                              tagNummer: e.target.value.trim() ? e.target.value : null,
                            })
                          }
                          sx={{ minWidth: 200 }}
                        />
                      </Stack>
                    );
                  })}
                </Stack>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {preview.statusConflicts.length > 0 && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>
              {t('import.conflictsSection', { count: preview.statusConflicts.length })}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {preview.statusConflicts.map((c) => {
                const key = importRowRef(c);
                const row = rowByRef.get(key);
                const label = rowLabel(c);
                if (!row) {
                  return (
                    <Typography key={key} variant="body2">
                      {label}: {c.message}
                    </Typography>
                  );
                }
                const decision = rows[key];
                const status = decision?.status ?? row.status;
                const openBlocks = row.ausgaben
                  .map((b, index) => ({ b, index }))
                  .filter(({ b }) => !b.zurueckAm);
                const keepOpen = decision?.keepOpen ?? lastOpenIndex(row);
                return (
                  <Stack key={key} spacing={1}>
                    <Typography variant="body2">
                      {label}: {describe(row)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {c.message}
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <TextField
                        select
                        size="small"
                        label={t('import.statusLabel', { row: label })}
                        value={status}
                        onChange={(e) =>
                          onChange(key, { status: e.target.value as BekleidungStatus })
                        }
                        sx={{ minWidth: 200 }}
                      >
                        {STATUSES.map((s) => (
                          <MenuItem key={s} value={s}>
                            {t(`status.${s}`)}
                          </MenuItem>
                        ))}
                      </TextField>
                      {status === 'ausgegeben' && openBlocks.length > 0 && (
                        <TextField
                          select
                          size="small"
                          label={t('import.keepOpenLabel', { row: label })}
                          value={keepOpen ?? ''}
                          onChange={(e) => onChange(key, { keepOpen: Number(e.target.value) })}
                          sx={{ minWidth: 260 }}
                        >
                          {openBlocks.map(({ b, index }) => (
                            <MenuItem key={index} value={index}>
                              {t('import.keepOpenOption', {
                                name: blockName(b),
                                date: b.ausgegebenAm ?? '?',
                              })}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                    </Stack>
                    {status === 'ausgegeben' && openBlocks.length === 0 && (
                      <Typography variant="body2" color="warning.main">
                        {t('import.issuedWithoutPerson')}
                      </Typography>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </>
  );
}
