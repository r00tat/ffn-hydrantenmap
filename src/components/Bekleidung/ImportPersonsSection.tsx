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
import type { ImportDecisions, ImportPreview } from '../../common/bekleidungImport';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';

/** Auswahlwert „neu anlegen" im Personen-Select. */
export const CREATE_PERSON = '__new__';

type PreviewPerson = ImportPreview['persons'][number];

export const importPersonName = (p: Pick<PreviewPerson, 'vorname' | 'nachname'>) =>
  `${p.vorname} ${p.nachname}`.trim();

/**
 * Vorbelegung je Person: zugeordnet → die Person, neu → neu anlegen.
 * Unsichere Treffer (ähnliche Schreibweise oder mehrere gleichnamige
 * Personen) bleiben bewusst offen: Ein vorgewählter Kandidat würde leicht
 * übersehen und hängte die Ausgaben der falschen Person an.
 */
export function defaultPersonChoices(preview: ImportPreview): Record<string, string> {
  const choices: Record<string, string> = {};
  for (const p of preview.persons) {
    if (p.match.status === 'matched' && p.match.personId) choices[p.key] = p.match.personId;
    else if (p.match.status !== 'uncertain') choices[p.key] = CREATE_PERSON;
  }
  return choices;
}

/** Anzahl der Personen ohne Entscheidung — solange > 0, ist der Import gesperrt. */
export function openPersonChoices(
  preview: ImportPreview,
  choices: Record<string, string>,
): number {
  return preview.persons.filter((p) => !choices[p.key]).length;
}

/** Entscheidungen für den Server; Personen ohne Entscheidung fehlen (der Server lehnt dann ab). */
export function personDecisions(
  preview: ImportPreview,
  choices: Record<string, string>,
): ImportDecisions['persons'] {
  const decisions: ImportDecisions['persons'] = {};
  for (const p of preview.persons) {
    const choice = choices[p.key];
    if (!choice) continue;
    decisions[p.key] =
      choice === CREATE_PERSON ? { create: importPersonName(p) } : { personId: choice };
  }
  return decisions;
}

const GROUPS = ['uncertain', 'new', 'matched'] as const;

/** Personen des Imports, nach Zuordnung gruppiert, je Person eine Entscheidung. */
export default function ImportPersonsSection({
  preview,
  persons,
  choices,
  onChange,
}: {
  preview: ImportPreview;
  persons: FahrtenbuchPerson[];
  choices: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const t = useTranslations('bekleidung');
  const nameOf = (id: string) => persons.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      {GROUPS.map((group) => {
        const list = preview.persons.filter((p) => p.match.status === group);
        if (list.length === 0) return null;
        return (
          <Accordion key={group} defaultExpanded={group !== 'matched'} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>
                {t(`import.${group}`)} ({list.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {list.map((p) => {
                  const options =
                    group === 'uncertain'
                      ? p.match.candidates
                      : persons.map((x) => x.id ?? '').filter(Boolean);
                  return (
                    <Stack
                      key={p.key}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{ alignItems: { sm: 'center' } }}
                    >
                      <Typography sx={{ flexGrow: 1 }}>{importPersonName(p)}</Typography>
                      <TextField
                        select
                        size="small"
                        label={importPersonName(p)}
                        value={choices[p.key] ?? ''}
                        onChange={(e) => onChange(p.key, e.target.value)}
                        error={!choices[p.key]}
                        sx={{ minWidth: 240 }}
                      >
                        <MenuItem value="" disabled>
                          {t('import.chooseOption')}
                        </MenuItem>
                        <MenuItem value={CREATE_PERSON}>{t('import.createNew')}</MenuItem>
                        {options.map((id) => (
                          <MenuItem key={id} value={id}>
                            {t('import.useExisting', { name: nameOf(id) })}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                  );
                })}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </>
  );
}
