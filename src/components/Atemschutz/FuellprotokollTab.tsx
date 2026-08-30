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
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import {
  geraetKennung,
  type AtemschutzFuellung,
  type AtemschutzGeraet,
  type FuellungInput,
} from '../../common/atemschutz';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import AtemschutzZeile from './AtemschutzZeile';
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
  fuellstationen: AtemschutzGeraet[];
  letzteFuellstationId?: string;
  onFuellstationChange?: (id: string) => void;
  /**
   * `''` = an der Station. Steuert im Dialog die Vorbelegung von `verrechnen`;
   * in das Dokument schreibt ihn der Aufrufer über `buildFuellungDocument`.
   */
  firecallId: string;
  eigeneFeuerwehr?: string;
  /** Herkunft je Zeile anzeigen — auf der eigenen Seite ja, am Einsatz nein. */
  zeigeHerkunft?: boolean;
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
  fuellstationen,
  letzteFuellstationId,
  onFuellstationChange,
  firecallId,
  eigeneFeuerwehr,
  zeigeHerkunft,
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

  /**
   * Die Kennung der Flasche.
   *
   * Zuerst aus den Stammdaten und erst dann aus dem, was beim Erfassen ins
   * Feld geschrieben wurde: Ist die Flasche verknüpft, ist die Kennung der
   * Stammdaten die richtige — auch für Zeilen, die entstanden sind, als der
   * Dialog noch die Bezeichnung eingetragen hat.
   */
  const kennung = (f: AtemschutzFuellung) => {
    const g = f.geraetId ? flaschenById.get(f.geraetId) : undefined;
    return (g && geraetKennung(g)) || f.flaschenNummer;
  };

  const titel = (f: AtemschutzFuellung) => {
    const k = kennung(f);
    if (k) return k;
    if (f.anzahl > 1) return t('fuellung.unbekannteFlaschen', { count: f.anzahl });
    return f.feuerwehr ?? '';
  };

  /** Die Bezeichnung — aber nicht, wenn sie schon die Überschrift ist. */
  const bezeichnung = (f: AtemschutzFuellung) => {
    const g = f.geraetId ? flaschenById.get(f.geraetId) : undefined;
    if (!g || g.bezeichnung === titel(f)) return undefined;
    return g.bezeichnung;
  };

  // Zweite Summe neben der Gesamtzahl. Sie entfällt, solange nichts zu
  // verrechnen ist — eine „davon 0" wäre nur Rauschen.
  const zuVerrechnen = useMemo(
    () =>
      fuellungen.filter((f) => f.verrechnen).reduce((s, f) => s + f.anzahl, 0),
    [fuellungen],
  );

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
          {zuVerrechnen > 0 &&
            ` · ${t('verrechnen.summe', { count: zuVerrechnen })}`}
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
              <AtemschutzZeile
                titel={titel(f)}
                chips={
                  <>
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
                    {zeigeHerkunft && f.firecallName && (
                      <Chip size="small" label={f.firecallName} />
                    )}
                    {f.verrechnen && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={t('verrechnen.chip')}
                      />
                    )}
                  </>
                }
                info={[f.feuerwehr, bezeichnung(f)]}
                details={[
                  f.gefuelltVon,
                  format.dateTime(new Date(f.zeitpunkt), {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  f.bemerkung,
                ]}
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
          fuellstationen={fuellstationen}
          letzteFuellstationId={letzteFuellstationId}
          firecallId={firecallId}
          eigeneFeuerwehr={eigeneFeuerwehr}
          onFuellstationChange={onFuellstationChange}
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
