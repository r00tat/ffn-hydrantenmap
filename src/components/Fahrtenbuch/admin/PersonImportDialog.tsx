'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type {
  PersonImportPlanRow,
  RecipientCsvError,
} from '../personCsvImport';
import {
  importPersonsFromCsv,
  previewPersonCsvImport,
} from '../stammdatenActions';

/** Zeilen, die der Import anfassen kann — alles andere ist nur Information. */
const IMPORTABLE = ['create', 'link', 'update'];

/**
 * Ergebnis der letzten Aktion — als Daten, nicht als fertiger Text, damit `t`
 * nicht in den Abhängigkeiten der Ladefunktion landet.
 */
type ImportStatus =
  | { kind: 'loadFailed'; error: string }
  | { kind: 'importFailed'; error: string }
  | {
      kind: 'imported';
      created: number;
      linked: number;
      updated: number;
      deactivated: number;
      skipped: number;
    };

const HIDDEN_INPUT = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  overflow: 'hidden',
  opacity: 0,
};

/**
 * Import der Personen aus dem CSV-Export von start.blaulichtsms.net. Die Datei
 * wird als Text an den Server geschickt, der parst, plant und die Vorschau
 * liefert; beim Import geht derselbe Text zurück, damit die Auswirkung nicht
 * von der Vorschau abweichen kann.
 */
export default function PersonImportDialog({
  groupId,
  groupName,
  onClose,
}: {
  groupId: string;
  /** Zielgruppe im Klartext — der Dialog verdeckt die Gruppenauswahl. */
  groupName: string;
  onClose: () => void;
}) {
  const t = useTranslations('fahrtenbuch');
  const [fileName, setFileName] = useState<string>();
  const [csvText, setCsvText] = useState<string>();
  const [rows, setRows] = useState<PersonImportPlanRow[]>([]);
  const [missing, setMissing] = useState<{ personId: string; name: string }[]>(
    [],
  );
  const [parseErrors, setParseErrors] = useState<RecipientCsvError[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [deactivate, setDeactivate] = useState<string[]>([]);
  const [status, setStatus] = useState<ImportStatus>();
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(
    async (text: string) => {
      setLoading(true);
      try {
        const result = await previewPersonCsvImport(groupId, text);
        setRows(result.rows);
        setMissing(result.missing);
        setParseErrors(result.parseErrors);
        // Abgänge bleiben bewusst unausgewählt: Deaktivieren ist nichts, was
        // ein Klick auf „Importieren" nebenbei tun soll.
        setDeactivate([]);
        setSelected(
          result.rows
            .filter((row) => IMPORTABLE.includes(row.action))
            .map((row) => row.recipientId),
        );
        // Erfolg löscht die Meldung nicht — nach dem Import wird die Vorschau
        // neu geladen, und der Bericht soll stehen bleiben. Zurückgesetzt wird
        // er bei der Dateiauswahl.
        if (!result.success) {
          setStatus({ kind: 'loadFailed', error: result.error ?? '' });
        }
      } catch (err) {
        // Die Action fängt ihre eigenen Fehler ab — hier landet nur ein
        // Transportfehler (offline, 500, veraltete Deployment-ID). Ohne diesen
        // Zweig sähe der Admin den leeren Zustand „keine Empfänger".
        setRows([]);
        setMissing([]);
        setParseErrors([]);
        setSelected([]);
        setDeactivate([]);
        setStatus({ kind: 'loadFailed', error: (err as Error).message });
      } finally {
        setLoading(false);
      }
    },
    [groupId],
  );

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setStatus(undefined);
    const text = await file.text();
    setCsvText(text);
    await load(text);
  };

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const run = async () => {
    if (!csvText) return;
    setRunning(true);
    try {
      // Reihenfolge der Vorschau, damit der Bericht der Tabelle folgt.
      const recipientIds = rows
        .filter((row) => selected.includes(row.recipientId))
        .map((row) => row.recipientId);
      const result = await importPersonsFromCsv(groupId, csvText, {
        recipientIds,
        deactivatePersonIds: missing
          .filter((entry) => deactivate.includes(entry.personId))
          .map((entry) => entry.personId),
      });
      if (!result.success) {
        setStatus({ kind: 'importFailed', error: result.error ?? '' });
        return;
      }
      setStatus({
        kind: 'imported',
        created: result.created,
        linked: result.linked,
        updated: result.updated,
        deactivated: result.deactivated,
        skipped: result.skipped,
      });
      // Vorschau neu laden, damit übernommene Zeilen als unverändert erscheinen
      // und nicht versehentlich ein zweites Mal ausgewählt werden.
      await load(csvText);
    } catch (err) {
      setStatus({ kind: 'importFailed', error: (err as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const parseErrorText = (error: RecipientCsvError) => {
    switch (error.kind) {
      case 'empty':
        return t('admin.csvErrors.empty');
      case 'missingColumns':
        return t('admin.csvErrors.missingColumns', {
          columns: error.columns.join(', '),
        });
      case 'duplicateId':
        return t('admin.csvErrors.duplicateId', {
          line: error.line,
          id: error.id,
        });
      default:
        return t(
          error.reason === 'missingId'
            ? 'admin.csvErrors.missingId'
            : 'admin.csvErrors.missingName',
          { line: error.line },
        );
    }
  };

  const statusText = status
    ? status.kind === 'imported'
      ? t('admin.personImportResult', {
          created: status.created,
          linked: status.linked,
          updated: status.updated,
          deactivated: status.deactivated,
          skipped: status.skipped,
        })
      : status.kind === 'loadFailed'
        ? t('admin.loadFailed', { message: status.error })
        : t('errors.saveFailed', { message: status.error })
    : undefined;

  const selectedCount = selected.length + deactivate.length;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('admin.importPersonsTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('admin.importPersonsHint', { group: groupName })}
        </Typography>

        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Button variant="outlined" component="label" disabled={running}>
            {t('admin.chooseFile')}
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label={t('admin.chooseFile')}
              style={HIDDEN_INPUT}
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
          </Button>
          {fileName && (
            <Typography variant="body2" color="text.secondary">
              {fileName}
            </Typography>
          )}
        </Stack>

        {statusText && (
          <Alert
            severity={status?.kind === 'imported' ? 'info' : 'error'}
            sx={{ mb: 2 }}
          >
            {statusText}
          </Alert>
        )}
        {parseErrors.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('admin.csvErrorsTitle')}
            {parseErrors.map((error, index) => (
              <Typography key={index} variant="body2">
                {parseErrorText(error)}
              </Typography>
            ))}
          </Alert>
        )}
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {/* Nach einem Ladefehler ist die Liste leer, aber nicht „leer" — sonst
            stünde die Fehlermeldung neben „keine Empfänger gefunden". */}
        {!loading &&
          !!csvText &&
          rows.length === 0 &&
          parseErrors.length === 0 &&
          status?.kind !== 'loadFailed' && (
            <Typography color="text.secondary">
              {t('admin.importPersonsNothing')}
            </Typography>
          )}

        {rows.length > 0 && (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>{t('admin.name')}</TableCell>
                  <TableCell>{t('admin.phone')}</TableCell>
                  <TableCell>{t('admin.email')}</TableCell>
                  <TableCell>{t('admin.note')}</TableCell>
                  <TableCell>{t('admin.importStatus')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.recipientId}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        slotProps={{ input: { 'aria-label': row.name } }}
                        disabled={!IMPORTABLE.includes(row.action) || running}
                        checked={selected.includes(row.recipientId)}
                        onChange={() =>
                          setSelected((current) =>
                            toggle(current, row.recipientId),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.phone}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.note}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {t(`admin.personImportActions.${row.action}`)}
                      </Typography>
                      {row.changes.length > 0 && (
                        <Typography variant="body2" color="text.secondary">
                          {t('admin.changesHint', {
                            fields: row.changes
                              .map((field) => t(`admin.changeFields.${field}`))
                              .join(', '),
                          })}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {missing.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ mt: 3 }}>
              {t('admin.missingTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('admin.missingHint')}
            </Typography>
            <Table size="small">
              <TableBody>
                {missing.map((entry) => (
                  <TableRow key={entry.personId}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        slotProps={{
                          input: {
                            'aria-label': `${t('admin.deactivate')}: ${entry.name}`,
                          },
                        }}
                        disabled={running}
                        checked={deactivate.includes(entry.personId)}
                        onChange={() =>
                          setDeactivate((current) =>
                            toggle(current, entry.personId),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>{entry.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="contained"
          onClick={run}
          disabled={running || loading || selectedCount === 0}
        >
          {t('admin.importRun')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
