'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FahrtenbuchPerson } from '../../../common/fahrtenbuch';
import useFahrtenbuchPersons from '../../../hooks/useFahrtenbuchPersons';
import {
  deleteFahrtenbuchPerson,
  saveFahrtenbuchPerson,
} from '../stammdatenActions';
import PersonImportDialog from './PersonImportDialog';
import PersonUserLinkDialog from './PersonUserLinkDialog';

export default function PersonAdmin({
  groupId,
  groupName,
  /**
   * Ob der Zuordnungs-Dialog angeboten wird. Nur für Admins: Er führt Namen und
   * E-Mail-Adressen aller Benutzerkonten der App auf, weit über die Gruppe
   * hinaus. Die Sicherheitsgrenze ist `actionAdminRequired()` in
   * `proposePersonUserLinks`, nicht dieses Flag.
   */
  canLinkUsers,
}: {
  groupId: string;
  /** Zielgruppe im Klartext — der Import-Dialog verdeckt die Gruppenauswahl. */
  groupName: string;
  canLinkUsers?: boolean;
}) {
  const t = useTranslations('fahrtenbuch');
  const tUserLinks = useTranslations('fahrtenbuch.userLinks');
  const { persons } = useFahrtenbuchPersons(groupId);
  const [editing, setEditing] = useState<FahrtenbuchPerson | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [active, setActive] = useState(true);
  const [recipientId, setRecipientId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dialogError, setDialogError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkingUsers, setLinkingUsers] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const openDialog = (person?: FahrtenbuchPerson) => {
    setEditing(person ?? ({} as FahrtenbuchPerson));
    setDialogError(undefined);
    setName(person?.name ?? '');
    setNote(person?.note ?? '');
    setActive(person?.active !== false);
    setRecipientId(person?.blaulichtSmsRecipientId ?? '');
    setPhone(person?.phone ?? '');
    setEmail(person?.email ?? '');
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveFahrtenbuchPerson(groupId, editing?.id, {
        name,
        active,
        blaulichtSmsRecipientId: recipientId,
        phone,
        email,
        note,
      });
      if (!result.success) {
        // Dialog bleibt offen, damit die Eingaben nicht verloren gehen.
        setDialogError(t('errors.saveFailed', { message: result.error ?? '' }));
        return;
      }
      setEditing(null);
    } catch (err) {
      setDialogError(
        t('errors.saveFailed', { message: (err as Error).message }),
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (person: FahrtenbuchPerson) => {
    if (!person.id) return;
    if (!window.confirm(t('admin.deletePersonConfirm'))) return;
    try {
      const result = await deleteFahrtenbuchPerson(groupId, person.id);
      if (!result.success) setDeleteError(result.error ?? '');
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  };

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={() => openDialog()}>
          {t('admin.addPerson')}
        </Button>
        <Button onClick={() => setImporting(true)}>
          {t('admin.importPersons')}
        </Button>
        {canLinkUsers && (
          <Button onClick={() => setLinkingUsers(true)}>
            {tUserLinks('open')}
          </Button>
        )}
      </Stack>

      {deleteError !== undefined && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setDeleteError(undefined)}
        >
          {t('admin.deleteFailed', { message: deleteError })}
        </Alert>
      )}

      {persons.length === 0 ? (
        <Typography color="text.secondary">{t('admin.noPersons')}</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.name')}</TableCell>
                <TableCell>{t('admin.phone')}</TableCell>
                <TableCell>{t('admin.note')}</TableCell>
                <TableCell>{t('admin.recipientId')}</TableCell>
                <TableCell>{t('admin.active')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {persons.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>{person.name}</TableCell>
                  <TableCell>{person.phone}</TableCell>
                  <TableCell>{person.note}</TableCell>
                  <TableCell>{person.blaulichtSmsRecipientId}</TableCell>
                  <TableCell>{person.active !== false ? '✓' : ''}</TableCell>
                  <TableCell align="right">
                    <Tooltip title={t('admin.editPerson')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`${t('admin.editPerson')}: ${person.name}`}
                          onClick={() => openDialog(person)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('admin.deletePersonConfirm')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`${t('admin.deletePersonConfirm')} ${person.name}`}
                          onClick={() => remove(person)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editing?.id ? t('admin.editPerson') : t('admin.addPerson')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <TextField
              label={t('admin.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label={t('admin.recipientId')}
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              fullWidth
            />
            <TextField
              label={t('admin.phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />
            <TextField
              label={t('admin.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label={t('admin.note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
              }
              label={t('admin.active')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving || !name.trim()}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {importing && (
        <PersonImportDialog
          groupId={groupId}
          groupName={groupName}
          onClose={() => setImporting(false)}
        />
      )}

      {canLinkUsers && linkingUsers && (
        <PersonUserLinkDialog
          open
          groupId={groupId}
          onClose={() => setLinkingUsers(false)}
        />
      )}
    </>
  );
}
