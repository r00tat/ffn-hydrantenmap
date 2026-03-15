'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  BlaulichtsmsConfigPublic,
  deleteBlaulichtsmsConfig,
  getBlaulichtsmsConfig,
  saveBlaulichtsmsConfig,
} from '../blaulicht-sms/credentialsActions';
import ConfirmDialog from '../../components/dialogs/ConfirmDialog';
import { Group } from './groupTypes';

interface Props {
  group: Group;
  onClose: () => void;
}

export default function BlaulichtsmsCredentialsDialog({ group, onClose }: Props) {
  const [config, setConfig] = useState<BlaulichtsmsConfigPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const groupId = group.id ?? '';

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const existing = await getBlaulichtsmsConfig(groupId);
      setConfig(existing);
      if (existing) {
        setCustomerId(existing.customerId);
        setUsername(existing.username);
      }
    } catch (err) {
      setError('Fehler beim Laden der Konfiguration.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!customerId || !username) {
      setError('Kundennummer und Benutzername sind erforderlich.');
      return;
    }
    if (!config?.hasPassword && !password) {
      setError('Ein Passwort ist erforderlich beim Erstellen neuer Zugangsdaten.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveBlaulichtsmsConfig(groupId, {
        customerId,
        username,
        password: password || undefined,
      });
      await loadConfig();
    } catch (err) {
      setError('Fehler beim Speichern der Konfiguration.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteBlaulichtsmsConfig(groupId);
      onClose();
    } catch (err) {
      setError('Fehler beim Löschen der Konfiguration.');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>BlaulichtSMS Zugangsdaten — {group.name}</DialogTitle>
        <DialogContent>
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {config && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Zuletzt geändert:{' '}
                  {config.updatedAt
                    ? new Date(config.updatedAt).toLocaleString('de-AT')
                    : '—'}{' '}
                  von {config.updatedBy ?? '—'}
                </Typography>
              )}
              <TextField
                label="Kundennummer"
                fullWidth
                margin="dense"
                variant="standard"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
              <TextField
                label="Benutzername"
                fullWidth
                margin="dense"
                variant="standard"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <TextField
                label="Passwort"
                fullWidth
                margin="dense"
                variant="standard"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={config?.hasPassword ? '••••••••' : ''}
                helperText={
                  config?.hasPassword
                    ? 'Leer lassen, um das bestehende Passwort zu behalten.'
                    : 'Passwort eingeben.'
                }
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((s) => !s)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button
            color="error"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!config || loading || deleting}
          >
            {deleting ? <CircularProgress size={20} /> : 'Zugangsdaten löschen'}
          </Button>
          <div>
            <Button onClick={onClose}>Abbrechen</Button>
            <Button
              onClick={handleSave}
              disabled={loading || saving}
              variant="contained"
            >
              {saving ? <CircularProgress size={20} /> : 'Speichern'}
            </Button>
          </div>
        </DialogActions>
      </Dialog>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Zugangsdaten löschen"
          text={`BlaulichtSMS-Zugangsdaten für "${group.name}" wirklich löschen?`}
          onConfirm={(confirmed) => {
            setShowDeleteConfirm(false);
            if (confirmed) handleDelete();
          }}
        />
      )}
    </>
  );
}
