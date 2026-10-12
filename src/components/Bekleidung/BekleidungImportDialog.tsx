'use client';

import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
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
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BekleidungFuehrung, BekleidungKategorie } from '../../common/bekleidung';
import {
  BEKLEIDUNG_IMPORT_MAX_BYTES,
  defaultRowDecisions,
  findTagCollisions,
  type ImportPreview,
  type ImportRowDecision,
} from '../../common/bekleidungImport';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';
import { callAction } from '../Geraete/admin/actionResult';
import { fileToBase64 } from '../Geraete/admin/fileToBase64';
import OnlineOnly from '../site/OnlineOnly';
import { importBekleidung, previewBekleidungImport } from './bekleidungActions';
import { parseBekleidungError, useBekleidungErrorText } from './bekleidungErrors';
import ImportCleanupSection from './ImportCleanupSection';
import ImportPersonsSection, {
  defaultPersonChoices,
  openPersonChoices,
  personDecisions,
} from './ImportPersonsSection';

type ImportTab = 'artikel' | 'personen' | 'tags' | 'status';

type ImportResult = { artikel: number; stuecke: number; ausgaben: number; personsCreated: number };

/** Bezeichnung mit Hersteller — Handschuhe heißen alle gleich. */
const artikelName = (a: ImportPreview['artikel'][number]) =>
  a.hersteller ? `${a.bezeichnung} (${a.hersteller})` : a.bezeichnung;

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
  const [rows, setRows] = useState<Record<string, ImportRowDecision>>({});
  const [merge, setMerge] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<ImportTab>('artikel');
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
      setRows(defaultRowDecisions(next));
      setMerge({});
      setTab('artikel');
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
        rows,
        ...(Object.keys(merge).length > 0 ? { merge } : {}),
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
  const collisions = useMemo(
    () => (preview ? findTagCollisions(preview, rows) : []),
    [preview, rows],
  );

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
              <Button
                component="label"
                variant="outlined"
                startIcon={<UploadFileIcon />}
                disabled={busy}
              >
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

            {openChoices > 0 && (
              <Alert severity="warning">{t('import.openChoices', { count: openChoices })}</Alert>
            )}
            {collisions.length > 0 && (
              <Alert severity="warning">
                {t('import.tagCollisions', {
                  count: collisions.length,
                  tags: collisions.join(', '),
                })}
              </Alert>
            )}

            <Tabs
              value={tab}
              onChange={(_, value: ImportTab) => setTab(value)}
              variant="scrollable"
              allowScrollButtonsMobile
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab
                value="artikel"
                label={t('import.tabArtikel', { count: preview.artikel.length })}
              />
              <Tab
                value="personen"
                label={t('import.tabPersonen', { count: preview.persons.length })}
                icon={
                  openChoices > 0 ? (
                    <WarningAmberIcon fontSize="small" color="warning" />
                  ) : undefined
                }
                iconPosition="end"
              />
              {preview.duplicateTags.length > 0 && (
                <Tab
                  value="tags"
                  label={t('import.duplicatesSection', { count: preview.duplicateTags.length })}
                  icon={
                    collisions.length > 0 ? (
                      <WarningAmberIcon fontSize="small" color="warning" />
                    ) : undefined
                  }
                  iconPosition="end"
                />
              )}
              {preview.statusConflicts.length > 0 && (
                <Tab
                  value="status"
                  label={t('import.conflictsSection', { count: preview.statusConflicts.length })}
                />
              )}
            </Tabs>

            {tab === 'artikel' && (
              <Box sx={{ overflowX: 'auto' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('import.mergeHint')}
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('fields.bezeichnung')}</TableCell>
                      <TableCell>{t('fields.hersteller')}</TableCell>
                      <TableCell>{t('fields.kategorie')}</TableCell>
                      <TableCell align="right">#</TableCell>
                      <TableCell>{t('fields.fuehrung')}</TableCell>
                      <TableCell>{t('import.mergeColumn')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.artikel.map((a) => {
                      const mergedInto = merge[a.key];
                      const isTarget = Object.values(merge).includes(a.key);
                      // Ziel: jeder andere Artikel derselben Kategorie, der nicht selbst
                      // zusammengeführt wird — sonst entstünde eine Kette.
                      const targets = preview.artikel.filter(
                        (b) => b.key !== a.key && b.kategorie === a.kategorie && !merge[b.key],
                      );
                      return (
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
                              disabled={!!mergedInto}
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
                          <TableCell>
                            <TextField
                              select
                              size="small"
                              label={t('import.mergeLabel', { name: artikelName(a) })}
                              value={mergedInto ?? ''}
                              disabled={isTarget || targets.length === 0}
                              onChange={(e) =>
                                setMerge((prev) => {
                                  const next = { ...prev };
                                  if (e.target.value) next[a.key] = e.target.value;
                                  else delete next[a.key];
                                  return next;
                                })
                              }
                              sx={{ minWidth: 200 }}
                            >
                              <MenuItem value="">{t('import.mergeNone')}</MenuItem>
                              {targets.map((b) => (
                                <MenuItem key={b.key} value={b.key}>
                                  {artikelName(b)}
                                </MenuItem>
                              ))}
                            </TextField>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
            {tab === 'personen' && (
              <ImportPersonsSection
                preview={preview}
                persons={persons}
                choices={choices}
                onChange={(key, value) => setChoices((prev) => ({ ...prev, [key]: value }))}
              />
            )}
            {(tab === 'tags' || tab === 'status') && (
              <ImportCleanupSection
                part={tab}
                preview={preview}
                rows={rows}
                collisions={collisions}
                onChange={(ref, patch) =>
                  setRows((prev) => {
                    const next = { ...prev[ref], ...patch };
                    // Ohne „ausgegeben" bleibt ohnehin nichts offen.
                    if (patch.status && patch.status !== 'ausgegeben') delete next.keepOpen;
                    return { ...prev, [ref]: next };
                  })
                }
              />
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.close')}</Button>
        {preview && (
          <OnlineOnly>
            <Button
              variant="contained"
              disabled={busy || openChoices > 0 || collisions.length > 0}
              onClick={handleImport}
            >
              {t('import.submit')}
            </Button>
          </OnlineOnly>
        )}
      </DialogActions>
    </Dialog>
  );
}
