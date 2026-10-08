'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BekleidungFuehrung, BekleidungKategorie } from '../../common/bekleidung';
import {
  BEKLEIDUNG_IMPORT_MAX_BYTES,
  type ImportPreview,
} from '../../common/bekleidungImport';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';
import { callAction } from '../Geraete/admin/actionResult';
import { fileToBase64 } from '../Geraete/admin/fileToBase64';
import OnlineOnly from '../site/OnlineOnly';
import { importBekleidung, previewBekleidungImport } from './bekleidungActions';
import { parseBekleidungError, useBekleidungErrorText } from './bekleidungErrors';
import ImportPersonsSection, {
  defaultPersonChoices,
  openPersonChoices,
  personDecisions,
} from './ImportPersonsSection';

type ImportResult = { artikel: number; stuecke: number; ausgaben: number; personsCreated: number };

/**
 * Einmaliger Import der Excel-Bestandslisten: Datei wählen, Vorschau,
 * Führung je Artikel und Zuordnung je Person entscheiden, importieren.
 * Der Server liest die Datei beim Import erneut; vom Browser kommen nur die
 * Entscheidungen.
 */
export default function BekleidungImportDialog({
  open,
  groupId,
  persons,
  onClose,
}: {
  open: boolean;
  groupId: string;
  persons: FahrtenbuchPerson[];
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fileBase64, setFileBase64] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [fuehrung, setFuehrung] = useState<Record<string, BekleidungFuehrung>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult>();

  const showError = (raw: string) =>
    setError(
      parseBekleidungError(raw).code === 'unknown'
        ? t('import.previewFailed', { error: raw })
        : errorText(raw),
    );

  const handleFile = async (file: File) => {
    setError(undefined);
    setPreview(undefined);
    setResult(undefined);
    if (file.size > BEKLEIDUNG_IMPORT_MAX_BYTES) {
      setError(errorText('fileTooLarge'));
      return;
    }
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const outcome = await callAction(() => previewBekleidungImport(groupId, base64));
      if (!outcome.ok) {
        showError(outcome.error);
        return;
      }
      const next = outcome.value as ImportPreview;
      setFileBase64(base64);
      setPreview(next);
      setFuehrung(Object.fromEntries(next.artikel.map((a) => [a.key, a.fuehrung])));
      setChoices(defaultPersonChoices(next));
    } catch (err) {
      showError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!preview || !fileBase64) return;
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      importBekleidung(groupId, fileBase64, {
        fuehrung,
        persons: personDecisions(preview, choices),
      }),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error));
      return;
    }
    setResult(outcome.value as ImportResult);
    setPreview(undefined);
    setFileBase64(undefined);
  };

  const sheetLabel = (sheet: BekleidungKategorie) => t(`kategorie.${sheet}`);
  const openChoices = preview ? openPersonChoices(preview, choices) : 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('import.title')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {result && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('import.done')} {t('import.result', result)}
          </Alert>
        )}

        {!preview && !result && (
          <Stack spacing={2}>
            <Typography variant="body2">{t('import.hint')}</Typography>
            <Box>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={busy}>
                {t('import.choose')}
                <input
                  hidden
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  data-testid="bekleidung-import-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleFile(file);
                  }}
                />
              </Button>
            </Box>
          </Stack>
        )}

        {preview && (
          <Stack spacing={2}>
            <Typography>
              {t('import.counts', {
                rows: preview.rows.length,
                artikel: preview.artikel.length,
                persons: preview.persons.length,
              })}
            </Typography>

            <Typography variant="h6">{t('import.artikelSection')}</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('fields.bezeichnung')}</TableCell>
                    <TableCell>{t('fields.hersteller')}</TableCell>
                    <TableCell>{t('fields.kategorie')}</TableCell>
                    <TableCell align="right">#</TableCell>
                    <TableCell>{t('fields.fuehrung')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.artikel.map((a) => (
                    <TableRow key={a.key}>
                      <TableCell>{a.bezeichnung}</TableCell>
                      <TableCell>{a.hersteller}</TableCell>
                      <TableCell>{sheetLabel(a.kategorie)}</TableCell>
                      <TableCell align="right">{a.rowCount}</TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          label={`${t('fields.fuehrung')} ${a.bezeichnung}`}
                          value={fuehrung[a.key] ?? a.fuehrung}
                          onChange={(e) =>
                            setFuehrung((prev) => ({
                              ...prev,
                              [a.key]: e.target.value as BekleidungFuehrung,
                            }))
                          }
                          sx={{ minWidth: 150 }}
                        >
                          <MenuItem value="einzeln">{t('fuehrung.einzeln')}</MenuItem>
                          <MenuItem value="menge">{t('fuehrung.menge')}</MenuItem>
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>

            <Typography variant="h6">{t('import.personsSection')}</Typography>
            <ImportPersonsSection
              preview={preview}
              persons={persons}
              choices={choices}
              onChange={(key, value) => setChoices((prev) => ({ ...prev, [key]: value }))}
            />
            {openChoices > 0 && (
              <Alert severity="warning">{t('import.openChoices', { count: openChoices })}</Alert>
            )}

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
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {preview.duplicateTags.map((d) => (
                      <li key={d.tagNummer}>
                        {d.tagNummer}:{' '}
                        {d.rowNumbers
                          .map((r) => t('import.row', { sheet: sheetLabel(r.sheet), row: r.rowNumber }))
                          .join(', ')}
                      </li>
                    ))}
                  </Box>
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
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {preview.statusConflicts.map((c) => (
                      <li key={`${c.sheet}-${c.rowNumber}`}>
                        {t('import.row', { sheet: sheetLabel(c.sheet), row: c.rowNumber })}: {c.message}
                      </li>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.close')}</Button>
        {preview && (
          <OnlineOnly>
            <Button variant="contained" disabled={busy || openChoices > 0} onClick={handleImport}>
              {t('import.submit')}
            </Button>
          </OnlineOnly>
        )}
      </DialogActions>
    </Dialog>
  );
}
