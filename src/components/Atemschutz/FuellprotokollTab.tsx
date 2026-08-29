'use client';

import { useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import {
  type AtemschutzFuellung,
  type AtemschutzGeraet,
  type FuellungInput,
} from '../../common/atemschutz';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import FuellungDialog from './FuellungDialog';

export interface FuellprotokollTabProps {
  groupId: string;
  fuellungen: AtemschutzFuellung[];
  flaschenGesamt: number;
  flaschen: AtemschutzGeraet[];
  feuerwehren: string[];
  personSuggestions: string[];
  defaultGefuelltVon: string;
  canWrite: boolean;
  onSave: (input: FuellungInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function FuellprotokollTab({
  groupId,
  fuellungen,
  flaschenGesamt,
  flaschen,
  feuerwehren,
  personSuggestions,
  defaultGefuelltVon,
  canWrite,
  onSave,
  onDelete,
}: FuellprotokollTabProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [edit, setEdit] = useState<AtemschutzFuellung | undefined>();
  const [loeschKandidat, setLoeschKandidat] = useState<AtemschutzFuellung>();

  const neu = () => {
    setEdit(undefined);
    setDialogOpen(true);
  };

  // Die Bezeichnung steht nicht am Protokolleintrag, sondern nur die Nummer.
  // Für die zweite Zeile wird sie aus den Stammdaten nachgeschlagen — ein
  // zweites Feld im Dokument liefe mit einer umbenannten Flasche auseinander.
  const flaschenById = useMemo(
    () => new Map(flaschen.map((f) => [f.id as string, f])),
    [flaschen],
  );

  const titel = (f: AtemschutzFuellung) => {
    if (f.flaschenNummer) return f.flaschenNummer;
    if (f.anzahl > 1) return t('fuellung.unbekannteFlaschen', { count: f.anzahl });
    return f.feuerwehr ?? '';
  };

  const druck = (f: AtemschutzFuellung) =>
    f.startdruck != null
      ? t('fuellung.druckRange', { start: f.startdruck, ende: f.enddruck })
      : t('fuellung.druckNurEnde', { ende: f.enddruck });

  return (
    <Box sx={{ pb: 10 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography variant="subtitle1">
          {t('fuellung.total', { count: flaschenGesamt })}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {/* Derselbe Weg wie über den Fab unten rechts. Der Knopf steht hier
            zusätzlich, weil am Rechner niemand in die Ecke des Fensters
            zielt — auf dem Handy bleibt der Fab der schnellere Griff. */}
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={neu}>
            {t('fuellung.add')}
          </Button>
        )}
      </Stack>

      {fuellungen.length === 0 ? (
        <Typography color="text.secondary">{t('fuellung.empty')}</Typography>
      ) : (
        <List dense>
          {fuellungen.map((f) => (
            <ListItem
              key={f.id}
              divider
              secondaryAction={
                canWrite ? (
                  <>
                    <IconButton
                      aria-label={tCommon('edit')}
                      onClick={() => {
                        setEdit(f);
                        setDialogOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      aria-label={t('fuellung.delete')}
                      color="warning"
                      onClick={() => setLoeschKandidat(f)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </>
                ) : undefined
              }
            >
              <ListItemText
                primary={
                  <Box
                    component="span"
                    sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
                  >
                    {titel(f)}
                    <Chip size="small" label={druck(f)} />
                    {f.anzahl > 1 && f.flaschenNummer && (
                      <Chip size="small" label={`×${f.anzahl}`} />
                    )}
                    {f.sichtkontrolle === 'mangel' && (
                      <Chip
                        size="small"
                        color="warning"
                        label={t('sichtkontrolle.mangel')}
                      />
                    )}
                  </Box>
                }
                secondary={[
                  f.geraetId
                    ? flaschenById.get(f.geraetId)?.bezeichnung
                    : undefined,
                  f.feuerwehr,
                  f.gefuelltVon,
                  format.dateTime(new Date(f.zeitpunkt), {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  f.bemerkung,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </ListItem>
          ))}
        </List>
      )}

      {canWrite && (
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          aria-label={t('fuellung.add')}
          onClick={neu}
        >
          <AddIcon />
        </Fab>
      )}

      {dialogOpen && (
        <FuellungDialog
          key={edit?.id ?? 'new'}
          open
          groupId={groupId}
          fuellung={edit}
          flaschen={flaschen}
          feuerwehren={feuerwehren}
          personSuggestions={personSuggestions}
          defaultGefuelltVon={defaultGefuelltVon}
          onClose={() => setDialogOpen(false)}
          onSave={(input) => onSave(input, edit?.id)}
        />
      )}

      {/* `ConfirmDialog` hält sein `open` in eigenem State, der nur beim ersten
          Rendern gesetzt wird — deshalb bedingt gemountet statt dauerhaft mit
          `open={...}`. */}
      {loeschKandidat && (
        <ConfirmDialog
          title={tCommon('confirmTitle')}
          text={t('fuellung.deleteConfirm')}
          yes={tCommon('yes')}
          no={tCommon('no')}
          onConfirm={async (confirmed) => {
            if (confirmed && loeschKandidat.id) {
              await onDelete(loeschKandidat.id);
            }
            setLoeschKandidat(undefined);
          }}
        />
      )}
    </Box>
  );
}
