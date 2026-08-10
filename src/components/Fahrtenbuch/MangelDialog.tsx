'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FahrtenbuchVehicle } from '../../common/fahrtenbuch';
import {
  MANGEL_STATUSES,
  type Mangel,
  type MangelStatus,
} from '../../common/mangel';
import {
  changeMangelStatus,
  createMangel,
  updateMangel,
} from './mangelActions';
import { mangelStatusColor } from './mangelStatus';

export interface MangelDialogProps {
  open: boolean;
  groupId: string;
  /** Auswahl beim Anlegen; beim Bearbeiten nur noch zur Anzeige. */
  vehicles: FahrtenbuchVehicle[];
  /** Vorbelegtes Fahrzeug beim Anlegen. */
  vehicleId?: string;
  /** Gesetzt beim Bearbeiten. */
  mangel?: Mangel;
  onClose: () => void;
}

/**
 * Wandelt einen ISO-Zeitstempel in den Wert eines `datetime-local`-Feldes und
 * zurück. Das Eingabefeld kennt keine Zeitzone; es zeigt Ortszeit, `toISOString`
 * liefert UTC. Ohne die Umrechnung spränge ein eingetragenes Datum beim
 * Speichern um den Zeitzonenversatz.
 */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Anlegen und Bearbeiten eines Mangels: Beschreibung, Status, Behebungsdatum
 * und eine Notiz, die beim Speichern an den Verlauf angehängt wird. Darunter
 * der bisherige Verlauf.
 */
export default function MangelDialog({
  open,
  groupId,
  vehicles,
  vehicleId,
  mangel,
  onClose,
}: MangelDialogProps) {
  const t = useTranslations('fahrtenbuch.maengel');
  // „Speichern"/„Abbrechen" stehen schon im Fahrtenbuch-Namespace — dieselben
  // Wörter ein zweites Mal zu pflegen hieße, sie irgendwann auseinanderlaufen
  // zu lassen.
  const tFahrtenbuch = useTranslations('fahrtenbuch');
  const format = useFormatter();

  const [vehicle, setVehicle] = useState(mangel?.vehicleId ?? vehicleId ?? '');
  const [description, setDescription] = useState(mangel?.description ?? '');
  const [status, setStatus] = useState<MangelStatus>(mangel?.status ?? 'open');
  // Beim Wechsel auf „behoben" mit „jetzt" vorbelegen: Der Regelfall ist die
  // Meldung am Tag der Reparatur, der Nachtrag die Ausnahme — und der bleibt
  // über dieses Feld möglich.
  const [resolvedAt, setResolvedAt] = useState(() =>
    toLocalInput(mangel?.resolvedAt),
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const isEdit = !!mangel?.id;

  const changeStatus = (next: MangelStatus) => {
    setStatus(next);
    if (next === 'resolved' && !resolvedAt) {
      setResolvedAt(toLocalInput(new Date().toISOString()));
    }
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      if (!isEdit) {
        const result = await createMangel(groupId, {
          vehicleId: vehicle,
          description,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        onClose();
        return;
      }

      // Beschreibung und Status sind zwei Vorgänge: Die Korrektur eines
      // Tippfehlers gehört nicht in den Verlauf, der Statuswechsel schon.
      if (description.trim() !== mangel.description) {
        const result = await updateMangel(groupId, mangel.id as string, {
          description,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
      }
      if (status !== mangel.status || note.trim() || resolvedAt) {
        const result = await changeMangelStatus(
          groupId,
          mangel.id as string,
          status,
          {
            note: note.trim() || undefined,
            resolvedAt:
              status === 'resolved' ? fromLocalInput(resolvedAt) : undefined,
          },
        );
        if (!result.success) {
          setError(result.error);
          return;
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!vehicle && !!description.trim() && !saving;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? t('editMangel') : t('newMangel')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && (
            <Alert severity="error">
              {t.has(`errors.${error}` as 'errors.saveFailed')
                ? t(`errors.${error}` as 'errors.descriptionMissing')
                : t('errors.saveFailed', { message: error })}
            </Alert>
          )}

          {isEdit ? (
            <Typography variant="subtitle1">{mangel.vehicleName}</Typography>
          ) : (
            <TextField
              select
              label={t('vehicle')}
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              fullWidth
            >
              {vehicles.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            label={t('description')}
            helperText={t('descriptionHelp')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          {/* Der Status ist beim Anlegen immer „offen" — die Action verwirft
              eine andere Angabe ohnehin, und ein Auswahlfeld, das nichts
              bewirkt, ist irreführend. */}
          {isEdit && (
            <>
              <TextField
                select
                label={t('status')}
                value={status}
                onChange={(e) => changeStatus(e.target.value as MangelStatus)}
                fullWidth
              >
                {MANGEL_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {t(`statuses.${s}` as 'statuses.open')}
                  </MenuItem>
                ))}
              </TextField>

              {status === 'resolved' && (
                <TextField
                  type="datetime-local"
                  label={t('resolvedAt')}
                  value={resolvedAt}
                  onChange={(e) => setResolvedAt(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
              )}

              <TextField
                label={t('addNote')}
                helperText={t('addNoteHelp')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />

              <Divider />
              <Typography variant="subtitle2">{t('notes')}</Typography>
              {(mangel.notes ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('noNotes')}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {[...(mangel.notes ?? [])].reverse().map((entry, index) => (
                    <Box key={`${entry.at}-${index}`}>
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {`${format.dateTime(new Date(entry.at), {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })} — ${entry.byName}`}
                        </Typography>
                        {entry.status && (
                          <Chip
                            size="small"
                            color={mangelStatusColor(entry.status)}
                            label={t('noteStatusChange', {
                              status: t(
                                `statuses.${entry.status}` as 'statuses.open',
                              ),
                            })}
                          />
                        )}
                      </Stack>
                      {entry.text && (
                        <Typography variant="body2">{entry.text}</Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tFahrtenbuch('cancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!canSave}>
          {tFahrtenbuch('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
