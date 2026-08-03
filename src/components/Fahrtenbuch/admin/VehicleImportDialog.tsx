'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { VehiclePresetId } from '../../../common/fahrtenbuch';
import {
  importVehiclesFromKostenersatz,
  previewVehicleImport,
} from '../stammdatenActions';
import type { VehicleImportPlanRow } from '../stammdatenLogic';

const PRESET_IDS: VehiclePresetId[] = ['fahrzeug', 'boot', 'none'];

/**
 * Ergebnis der letzten Aktion — als Daten, nicht als fertiger Text. Der Text
 * entsteht beim Rendern, damit `t` nicht in den Abhängigkeiten des Ladeeffekts
 * landet.
 */
type ImportStatus =
  | { kind: 'loadFailed'; error: string }
  | { kind: 'importFailed'; error: string }
  | { kind: 'imported'; created: number; skipped: number };

/**
 * Vorschau des Fahrzeug-Imports aus dem Kostenersatz-Bestand. Bereits
 * importierte Fahrzeuge werden angezeigt, aber nicht zur Auswahl angeboten;
 * das Preset ist je Zeile aus dem Namen vorgeschlagen und änderbar.
 */
export default function VehicleImportDialog({
  groupId,
  onClose,
}: {
  groupId: string;
  onClose: () => void;
}) {
  const t = useTranslations('fahrtenbuch');
  const [rows, setRows] = useState<VehicleImportPlanRow[]>([]);
  const [selection, setSelection] = useState<Record<string, VehiclePresetId>>({});
  const [status, setStatus] = useState<ImportStatus>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await previewVehicleImport(groupId);
      setRows(result.rows);
      const initial: Record<string, VehiclePresetId> = {};
      for (const row of result.rows) {
        if (!row.alreadyImported) initial[row.sourceId] = row.preset;
      }
      setSelection(initial);
      if (!result.success) {
        setStatus({ kind: 'loadFailed', error: result.error ?? '' });
      }
    } catch (err) {
      // Die Action fängt ihre eigenen Fehler ab — hier landet nur ein
      // Transportfehler (offline, 500, veraltete Deployment-ID). Ohne diesen
      // Zweig sähe der Admin den leeren Zustand „keine Fahrzeuge gefunden".
      setRows([]);
      setSelection({});
      setStatus({ kind: 'loadFailed', error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      const result = await importVehiclesFromKostenersatz(
        groupId,
        Object.entries(selection).map(([sourceId, preset]) => ({
          sourceId,
          preset,
        })),
      );
      if (!result.success) {
        setStatus({ kind: 'importFailed', error: result.error ?? '' });
        return;
      }
      setStatus({
        kind: 'imported',
        created: result.created,
        skipped: result.skipped,
      });
      // Vorschau neu laden, damit angelegte Fahrzeuge als bereits importiert
      // erscheinen und nicht versehentlich ein zweites Mal ausgewählt werden.
      await load();
    } catch (err) {
      setStatus({ kind: 'importFailed', error: (err as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const statusText = status
    ? status.kind === 'imported'
      ? t('admin.importResult', {
          created: status.created,
          skipped: status.skipped,
        })
      : status.kind === 'loadFailed'
        ? t('admin.loadFailed', { message: status.error })
        : t('errors.saveFailed', { message: status.error })
    : undefined;

  const selectedCount = Object.keys(selection).length;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('admin.importTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('admin.importHint')}
        </Typography>
        {statusText && (
          <Alert
            severity={status?.kind === 'imported' ? 'info' : 'error'}
            sx={{ mb: 2 }}
          >
            {statusText}
          </Alert>
        )}
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {/* Nach einem Ladefehler ist die Liste leer, aber nicht „leer" —
            sonst stünde die Fehlermeldung neben „keine Fahrzeuge gefunden". */}
        {!loading && rows.length === 0 && status?.kind !== 'loadFailed' && (
          <Typography color="text.secondary">
            {t('admin.importNothing')}
          </Typography>
        )}
        {rows.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>{t('admin.name')}</TableCell>
                <TableCell>{t('admin.preset')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.sourceId}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      slotProps={{ input: { 'aria-label': row.name } }}
                      disabled={row.alreadyImported || running}
                      checked={!!selection[row.sourceId]}
                      onChange={(e) =>
                        setSelection((current) => {
                          const next = { ...current };
                          if (e.target.checked) next[row.sourceId] = row.preset;
                          else delete next[row.sourceId];
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {row.name}
                    {row.alreadyImported && (
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        sx={{ ml: 1 }}
                      >
                        {t('admin.alreadyImported')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      label={t('admin.preset')}
                      disabled={
                        row.alreadyImported || !selection[row.sourceId] || running
                      }
                      value={selection[row.sourceId] ?? row.preset}
                      onChange={(e) =>
                        setSelection((current) => ({
                          ...current,
                          [row.sourceId]: e.target.value as VehiclePresetId,
                        }))
                      }
                      sx={{ minWidth: 220 }}
                    >
                      {PRESET_IDS.map((id) => (
                        <MenuItem key={id} value={id}>
                          {t(`admin.presets.${id}`)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
