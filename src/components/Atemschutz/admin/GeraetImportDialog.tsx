'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  geraetLabel,
  geraetNebenkennungen,
} from '../../../common/atemschutz';
import type { ImportPlanZeile } from '../../../common/atemschutzImport';
import {
  importAtemschutzGeraete,
  previewAtemschutzImport,
} from '../atemschutzActions';

type ZeilenAktion = 'new' | 'update' | 'skip';

export interface GeraetImportDialogProps {
  open: boolean;
  groupId: string;
  onClose: () => void;
  onDone: () => void;
}

export default function GeraetImportDialog({
  open,
  groupId,
  onClose,
  onDone,
}: GeraetImportDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [plan, setPlan] = useState<ImportPlanZeile[]>();
  // Die Wahl je Zeile, getrennt vom Plan: Der Plan ist das Ergebnis des
  // Servers, die Wahl gehört dem Benutzer. Vermischt man beides, ist nach
  // einer erneuten Vorschau nicht mehr erkennbar, was er entschieden hatte.
  const [aktionen, setAktionen] = useState<ZeilenAktion[]>([]);
  const [ergebnis, setErgebnis] = useState<{ created: number; updated: number }>();

  const uebersetzterFehler = (key?: string) =>
    key && ['fileMissing', 'fileTooLarge', 'tooManyRows'].includes(key)
      ? t(`import.errors.${key}` as 'import.errors.fileMissing')
      : (key ?? t('errors.saveFailed'));

  const handleFile = async (file: File) => {
    setBusy(true);
    setFehler(undefined);
    setErgebnis(undefined);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await previewAtemschutzImport(groupId, formData);
      if (!result.success || !result.plan) {
        setFehler(uebersetzterFehler(result.error));
        return;
      }
      setPlan(result.plan);
      // Vorbelegung: was der Abgleich sagt. Zeilen, deren Kennung in der Datei
      // doppelt vorkommt, stehen auf "überspringen" — sonst überschreibt die
      // zweite Zeile still die erste.
      setAktionen(
        result.plan.map((z) => (z.duplicateInFile ? 'skip' : z.status)),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!plan) return;
    setBusy(true);
    setFehler(undefined);
    try {
      const zuSchreiben = plan
        .map((zeile, i) => ({ zeile, aktion: aktionen[i] }))
        .filter(({ aktion }) => aktion !== 'skip')
        .map(({ zeile, aktion }) =>
          aktion === 'new'
            ? { ...zeile, status: 'new' as const, existingId: undefined }
            : zeile,
        );
      const result = await importAtemschutzGeraete(groupId, zuSchreiben);
      if (!result.success) {
        setFehler(uebersetzterFehler(result.error));
        return;
      }
      setErgebnis({ created: result.created ?? 0, updated: result.updated ?? 0 });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const zaehle = (aktion: ZeilenAktion) =>
    aktionen.filter((a) => a === aktion).length;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('import.title')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        {fehler && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {fehler}
          </Alert>
        )}
        {ergebnis && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('import.done', ergebnis)}
          </Alert>
        )}

        {!plan && (
          <>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t('import.hint')}
            </Typography>
            <Button variant="outlined" component="label" disabled={busy}>
              {t('import.chooseFile')}
              <input
                type="file"
                hidden
                accept=".xlsx,.csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </Button>
          </>
        )}

        {plan && (
          <>
            <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2">
                {t('import.preview', { count: plan.length })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('import.summary', {
                  created: zaehle('new'),
                  updated: zaehle('update'),
                  skipped: zaehle('skip'),
                })}
              </Typography>
            </Stack>
            <List dense sx={{ maxHeight: 420, overflow: 'auto' }}>
              {plan.map((zeile, i) => (
                <ListItem
                  key={`${zeile.geraet.externeId ?? ''}-${zeile.geraet.bezeichnung}-${i}`}
                  secondaryAction={
                    <TextField
                      select
                      size="small"
                      value={aktionen[i]}
                      onChange={(e) =>
                        setAktionen((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value as ZeilenAktion;
                          return next;
                        })
                      }
                      sx={{ minWidth: 150 }}
                    >
                      <MenuItem value="new">{t('import.statusNew')}</MenuItem>
                      <MenuItem
                        value="update"
                        disabled={!zeile.existingId}
                      >
                        {t('import.statusUpdate')}
                      </MenuItem>
                      <MenuItem value="skip">{t('import.statusSkip')}</MenuItem>
                    </TextField>
                  }
                >
                  <ListItemText
                    primary={geraetLabel(zeile.geraet)}
                    secondary={
                      <>
                        {[
                          zeile.geraet.feuerwehr,
                          ...geraetNebenkennungen(zeile.geraet),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {zeile.matchedBy && (
                          <Chip
                            size="small"
                            sx={{ ml: 1 }}
                            label={t('import.matchedBy', {
                              field: zeile.matchedBy,
                            })}
                          />
                        )}
                        {zeile.duplicateInFile && (
                          <Chip
                            size="small"
                            color="warning"
                            sx={{ ml: 1 }}
                            label={t('import.duplicateInFile')}
                          />
                        )}
                        {zeile.withoutIdentifier && (
                          <Chip
                            size="small"
                            color="warning"
                            sx={{ ml: 1 }}
                            label={t('import.withoutIdentifier')}
                          />
                        )}
                      </>
                    }
                    // Chip ist ein div — in einem <p> wäre es ungültiges HTML,
                    // siehe MUI-Regeln in CLAUDE.md. In MUI 9 läuft das über
                    // `slotProps`, `secondaryTypographyProps` gibt es nicht mehr.
                    slotProps={{ secondary: { component: 'div' } }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('close')}</Button>
        <Button
          variant="contained"
          disabled={busy || !plan || zaehle('skip') === plan?.length}
          onClick={handleImport}
        >
          {t('import.button')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
