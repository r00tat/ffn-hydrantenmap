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
import React, { useCallback, useState } from 'react';
import {
  sendPasswordResetEmailAction,
  setUserPasswordAction,
} from '../../app/users/action';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { feuerwehren } from '../../common/feuerwehren';
import { UserRecordExtended, userTextFields } from '../../common/users';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 10 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

export interface UserRecordExtendedDialogOptions {
  onClose: (item?: UserRecordExtended) => void;
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
          label="Neues Passwort"
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
                    title="Passwort kopieren"
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
          label="Reset-Link"
          value={resetLink}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => navigator.clipboard.writeText(resetLink)}
                    size="small"
                    title="Link kopieren"
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
          title="Passwort zurücksetzen"
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
  const [open, setOpen] = useState(true);
  const [user, setUserRecordExtended] =
    useState<UserRecordExtended>(userDefault);

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
    setUserRecordExtended(
      (prev) =>
        ({
          ...prev,
          groups: typeof value === 'string' ? value.split(',') : value,
        } as unknown as UserRecordExtended)
    );
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Benutzer {user.displayName} bearbeiten</DialogTitle>
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
          <InputLabel id="fw-label">Feuerwehr</InputLabel>
          <Select
            labelId="fw-label"
            id="user-fw"
            value={user.feuerwehr || 'neusiedl'}
            label="Feuerwehr"
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
          <InputLabel id="user-group-checkbox-label">Gruppen</InputLabel>
          <Select
            labelId="user-group-checkbox-label"
            id="user-group-checkbox"
            multiple
            value={user.groups || []}
            onChange={handleGroupChange}
            input={<OutlinedInput label="Group" />}
            renderValue={(selected) =>
              selected
                .map((key) => groups[key])
                .filter((v) => v)
                .join(', ')
            }
            MenuProps={MenuProps}
          >
            {Object.entries(groups).map(([key, name]) => (
              <MenuItem key={key} value={key}>
                <Checkbox checked={(user.groups || []).indexOf(key) > -1} />
                <ListItemText primary={name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={user.authorized}
                onChange={onChangeSwitch('authorized')}
              />
            }
            label="Authorized"
          />
        </FormGroup>

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
            onClose(user);
          }}
        >
          Aktualisieren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
