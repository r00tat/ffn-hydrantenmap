import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import React, { useCallback, useState } from 'react';
import {
  sendPasswordResetEmailAction,
  setUserPasswordAction,
} from '../../app/users/action';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { feuerwehren } from '../../common/feuerwehren';
import { guestCanWrite, isFirecallGuest } from '../../common/firecallGuest';
import { isTenantGroupId } from '../../common/tenantGroups';
import { userMemberGroupIds } from '../../common/userGroupRoles';
import { UserRecordExtended, userTextFields } from '../../common/users';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  slotProps: {
    paper: {
      style: {
        maxHeight: ITEM_HEIGHT * 10 + ITEM_PADDING_TOP,
        width: 250,
      },
    },
  },
};

export interface UserRecordExtendedDialogOptions {
  /**
   * `memberGroupIds` sind die gewählten Gruppen. Sie stehen getrennt vom
   * Benutzer, weil das alte Feld `groups` nicht mehr die Mitgliedschaft trägt.
   */
  onClose: (item?: UserRecordExtended, memberGroupIds?: string[]) => void;
  user: UserRecordExtended;
  groups: { [key: string]: string };
}

function generatePassword() {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join('');
}

function PasswordResetSection({ uid, email }: { uid: string; email: string }) {
  const t = useTranslations('userDialog');
  const [resetLink, setResetLink] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSendResetEmail = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    setResetLink('');
    try {
      const result = await sendPasswordResetEmailAction(email);
      setResetLink(result.link);
      setFeedback({
        type: 'success',
        message: `Passwort-Reset Link für ${email} wurde generiert.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Fehler: ${err.message || err}`,
      });
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleSetPassword = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    const password = generatePassword();
    try {
      await setUserPasswordAction(uid, password);
      setGeneratedPassword(password);
      setFeedback({
        type: 'success',
        message: 'Neues Passwort wurde gesetzt:',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Fehler: ${err.message || err}`,
      });
    } finally {
      setLoading(false);
    }
  }, [uid]);

  return (
    <>
      {feedback && (
        <Alert severity={feedback.type} sx={{ mb: 1 }} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}
      {generatedPassword && (
        <TextField
          fullWidth
          size="small"
          label={t('newPassword')}
          value={generatedPassword}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() =>
                      navigator.clipboard.writeText(generatedPassword)
                    }
                    size="small"
                    title={t('copyPassword')}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 1 }}
        />
      )}
      {resetLink && (
        <TextField
          fullWidth
          size="small"
          label={t('resetLink')}
          value={resetLink}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => navigator.clipboard.writeText(resetLink)}
                    size="small"
                    title={t('copyLink')}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 1 }}
        />
      )}
      <Button
        variant="outlined"
        onClick={handleSendResetEmail}
        disabled={loading || !email}
        sx={{ mr: 1 }}
      >
        {loading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
        Passwort Reset-Link generieren
      </Button>
      <Button
        variant="outlined"
        onClick={() => setShowConfirm(true)}
        disabled={loading}
      >
        Passwort zurücksetzen
      </Button>
      {showConfirm && (
        <ConfirmDialog
          title={t('resetPassword')}
          text={`Soll das Passwort für ${email} wirklich zurückgesetzt werden?`}
          onConfirm={(confirmed) => {
            setShowConfirm(false);
            if (confirmed) {
              handleSetPassword();
            }
          }}
        />
      )}
    </>
  );
}

export default function UserRecordExtendedDialog({
  onClose,
  user: userDefault,
  groups,
}: UserRecordExtendedDialogOptions) {
  const t = useTranslations('userDialog');
  const [open, setOpen] = useState(true);
  const [user, setUserRecordExtended] =
    useState<UserRecordExtended>(userDefault);
  const [memberGroups, setMemberGroups] = useState<string[]>(() =>
    userMemberGroupIds(userDefault)
  );
  // Nur Mandanten: `allUsers` bekommt jeder, und Kostenersatz ist keine
  // Gruppe mehr, sondern eine Rolle je Gruppe.
  const tenantGroups = Object.entries(groups).filter(([key]) =>
    isTenantGroupId(key)
  );

  const onChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement> | SelectChangeEvent) => {
      setUserRecordExtended(
        (prev) =>
          ({
            ...prev,
            [field]: event.target.value,
          } as unknown as UserRecordExtended)
      );
    };
  const onChangeTextField =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(field)(event);

  const onChangeSwitch =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setUserRecordExtended(
        (prev) =>
          ({
            ...prev,
            [field]: event.target.checked,
          } as unknown as UserRecordExtended)
      );
    };

  const handleGroupChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value },
    } = event;
    setMemberGroups(typeof value === 'string' ? value.split(',') : value);
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>{t('title', { name: user.displayName ?? '' })}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          UID: {user.uid}
          <br />
          E-Mail: {user.email}
          <br />
          Feuerwehr: {user.feuerwehr}
          <br />
          Abschnitt: {feuerwehren[user.feuerwehr || 'fallback']?.abschnitt}
        </DialogContentText>
        <FormControl fullWidth variant="standard">
          <InputLabel id="fw-label">{t('feuerwehr')}</InputLabel>
          <Select
            labelId="fw-label"
            id="user-fw"
            value={user.feuerwehr || 'neusiedl'}
            label={t('feuerwehr')}
            onChange={onChange('feuerwehr')}
          >
            {Object.entries(feuerwehren)
              .filter(([key]) => key !== 'fallback')
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([key, fw]) => (
                <MenuItem key={key} value={key}>
                  {fw.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        {Object.entries(userTextFields).map(([key, label]) => (
          <TextField
            margin="dense"
            id={key}
            key={key}
            label={label}
            type="text"
            fullWidth
            variant="standard"
            onChange={onChangeTextField(key)}
            value={((user as any)[key] as string) || ''}
          />
        ))}
        <FormControl sx={{ m: 1, width: 300 }}>
          <InputLabel id="user-group-checkbox-label">{t('groups')}</InputLabel>
          <Select
            labelId="user-group-checkbox-label"
            id="user-group-checkbox"
            multiple
            value={memberGroups}
            onChange={handleGroupChange}
            input={<OutlinedInput label={t('groupLabel')} />}
            renderValue={(selected) =>
              selected
                .map((key) => groups[key])
                .filter((v) => v)
                .join(', ')
            }
            MenuProps={MenuProps}
          >
            {tenantGroups.map(([key, name]) => (
              <MenuItem key={key} value={key}>
                <Checkbox checked={memberGroups.includes(key)} />
                <ListItemText primary={name} />
              </MenuItem>
            ))}
          </Select>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('rolesHint')}
          </Typography>
        </FormControl>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={user.authorized}
                onChange={onChangeSwitch('authorized')}
              />
            }
            label={t('authorized')}
          />
          <FormControlLabel
            control={
              <Switch
                checked={!!user.isAdmin}
                onChange={onChangeSwitch('isAdmin')}
              />
            }
            label={t('admin')}
          />
        </FormGroup>

        {/* Einsatz-Gäste sind über einen Share-Link angelegt und auf einen
            einzelnen Einsatz beschränkt. Ihr Schreibrecht lässt sich hier
            nachträglich ändern — die Berechtigungen werden beim Token-Tausch
            aus dem Benutzerdokument gelesen. */}
        {isFirecallGuest(user) && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2">
              {t('firecallGuestSection')}
            </Typography>
            <DialogContentText>
              {t('firecallGuestFor', { firecall: user.firecall ?? '' })}
            </DialogContentText>
            <FormControlLabel
              control={
                <Switch
                  checked={guestCanWrite(user)}
                  onChange={onChangeSwitch('firecallWrite')}
                />
              }
              label={t('firecallWrite')}
            />
            <Typography variant="body2" color="text.secondary">
              {t('firecallWriteHint')}
            </Typography>
          </>
        )}

        <Divider sx={{ my: 2 }} />
        <PasswordResetSection uid={user.uid} email={user.email || ''} />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            setOpen(false);
            onClose();
          }}
        >
          Abbrechen
        </Button>
        <Button
          onClick={() => {
            setOpen(false);
            onClose(user, memberGroups);
          }}
        >
          Aktualisieren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
