'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  FUELLPROTOKOLL_CSV_SPALTEN,
  parseFuellprotokollCsv,
  type CsvZeileErgebnis,
} from '../../common/fuellprotokollCsv';
import {
  importFuellungen,
  previewFuellungImport,
  type FuellungImportZeile,
} from './fuellprotokollActions';

/** Obergrenze der Datei. Derselbe Riegel wie beim Geräteimport. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Fehlerschlüssel mit eigenem Text — aus dem Zerlegen der Datei *und* von der
 * Server Action. Alles andere kommt als Rohmeldung durch: besser eine
 * englische Zeile als ein verschluckter Fehler.
 */
const IMPORT_FEHLER = [
  'fileEmpty',
  'columnsMissing',
  'tooManyRows',
  'fileTooLarge',
  'dateInvalid',
  'enddruckInvalid',
  'gefuelltVonMissing',
  'identifierMissing',
  'anzahlInvalid',
  'startdruckAboveEnddruck',
];

export interface FuellungImportDialogProps {
  open: boolean;
  groupId: string;
  onClose: () => void;
}

/**
 * Nachtrag bestehender Füllungen aus einer CSV-Datei.
 *
 * Die Datei wird **hier im Browser** zerlegt und nicht auf dem Server: Datum
 * und Uhrzeit stehen als Ortszeit darin, und der Server läuft in UTC — dort
 * gelesen läge jede Uhrzeit um den Zonenversatz daneben. Der Server bekommt
 * fertige Zeitpunkte und entscheidet nur noch über Dubletten. Ausführlich in
 * `fuellprotokollCsv.ts`.
 */
export default function FuellungImportDialog({
  open,
  groupId,
  onClose,
}: FuellungImportDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [zeilenFehler, setZeilenFehler] = useState<CsvZeileErgebnis[]>([]);
  const [plan, setPlan] = useState<FuellungImportZeile[]>();
  const [ergebnis, setErgebnis] = useState<{
    created: number;
    skipped: number;
  }>();

  const uebersetzt = (key?: string) =>
    key && IMPORT_FEHLER.includes(key)
      ? t(`fuellprotokollImport.errors.${key}` as 'fuellprotokollImport.errors.fileEmpty')
      : (key ?? t('errors.saveFailed'));

  const handleFile = async (file: File) => {
    setBusy(true);
    setFehler(undefined);
    setErgebnis(undefined);
    setPlan(undefined);
    setZeilenFehler([]);
    try {
      if (file.size > MAX_BYTES) {
        setFehler(uebersetzt('fileTooLarge'));
        return;
      }
      const { zeilen, fehler: dateiFehler } = parseFuellprotokollCsv(await file.text());
      if (dateiFehler) {
        setFehler(uebersetzt(dateiFehler));
        return;
      }
      // Kaputte Zeilen bleiben sichtbar, statt still zu verschwinden — wer
      // nachträgt, muss wissen, was nicht angekommen ist.
      setZeilenFehler(zeilen.filter((z) => z.fehler));

      const lesbar: FuellungImportZeile[] = zeilen
        .filter((z) => z.fuellung)
        .map((z) => ({
          zeile: z.zeile,
          fuellung: z.fuellung!,
          status: 'new' as const,
        }));
      if (lesbar.length === 0) {
        setFehler(uebersetzt('fileEmpty'));
        return;
      }

      const result = await previewFuellungImport(groupId, lesbar);
      if (!result.success || !result.plan) {
        setFehler(uebersetzt(result.error));
        return;
      }
      setPlan(result.plan);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!plan) return;
    setBusy(true);
    setFehler(undefined);
    try {
      const result = await importFuellungen(groupId, plan);
      if (!result.success) {
        setFehler(uebersetzt(result.error));
        return;
      }
      setErgebnis({
        created: result.created ?? 0,
        skipped: result.skipped ?? 0,
      });
      setPlan(undefined);
    } finally {
      setBusy(false);
    }
  };

  const neue = plan?.filter((z) => z.status === 'new').length ?? 0;
  const dubletten = (plan?.length ?? 0) - neue;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('fuellprotokollImport.title')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('fuellprotokollImport.hint')}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 2 }}>
          {FUELLPROTOKOLL_CSV_SPALTEN.join(' · ')}
        </Typography>

        {fehler && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {fehler}
          </Alert>
        )}

        {ergebnis && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('fuellprotokollImport.done', ergebnis)}
          </Alert>
        )}

        <Button variant="outlined" component="label" disabled={busy}>
          {t('fuellprotokollImport.chooseFile')}
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Zurücksetzen, damit dieselbe Datei nach einer Korrektur
              // erneut gewählt werden kann — ohne das feuert `change` nicht.
              e.target.value = '';
              if (file) void handleFile(file);
            }}
          />
        </Button>

        {zeilenFehler.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              {t('fuellprotokollImport.rowErrors', {
                count: zeilenFehler.length,
              })}
            </Typography>
            <List dense disablePadding>
              {zeilenFehler.slice(0, 20).map((z) => (
                <ListItem key={z.zeile} disableGutters>
                  <ListItemText
                    primary={t('fuellprotokollImport.row', { row: z.zeile })}
                    secondary={uebersetzt(z.fehler)}
                  />
                </ListItem>
              ))}
            </List>
          </Alert>
        )}

        {plan && (
          <Alert severity={neue > 0 ? 'info' : 'warning'} sx={{ mt: 2 }}>
            {t('fuellprotokollImport.preview', { neue, dubletten })}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('close')}</Button>
        <Button variant="contained" disabled={busy || neue === 0} onClick={handleImport}>
          {t('fuellprotokollImport.button')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
