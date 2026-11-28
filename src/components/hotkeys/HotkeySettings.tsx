'use client';

import BlockIcon from '@mui/icons-material/Block';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  HOTKEY_ACTIONS,
  HOTKEY_GROUPS,
  bindingFromEvent,
  findConflicts,
  formatBinding,
  type HotkeyActionId,
} from '../../common/hotkeys';
import HotkeyKbd from './HotkeyKbd';
import { useHotkeys } from './HotkeyProvider';
import { useIsMac } from './useHotkeyLabel';

/**
 * Nimmt die nächste Tastenkombination auf. Solange sie läuft, sind alle
 * Kürzel ausgesetzt (`suspend`), sonst löste die gedrückte Kombination gleich
 * ihre bisherige Aktion aus. Escape bricht ab.
 */
function useRecorder(onRecorded: (id: HotkeyActionId, binding: string) => void) {
  const { suspend } = useHotkeys();
  const [recording, setRecording] = useState<HotkeyActionId>();

  useEffect(() => {
    if (!recording) return;
    const release = suspend();
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(undefined);
        return;
      }
      const binding = bindingFromEvent(event);
      if (!binding) return; // nur ein Modifikator — weiter warten
      onRecorded(recording, binding);
      setRecording(undefined);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      release();
    };
  }, [recording, suspend, onRecorded]);

  return { recording, setRecording };
}

export default function HotkeySettings() {
  const t = useTranslations('hotkeys');
  const {
    enabled,
    setEnabled,
    bindings,
    overrides,
    setBinding,
    resetBinding,
    resetAll,
  } = useHotkeys();
  const mac = useIsMac();
  const { recording, setRecording } = useRecorder(setBinding);
  const conflicts = findConflicts(bindings);
  const conflicting = new Set(conflicts.flatMap((conflict) => conflict.actions));
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <Box sx={{ p: 2, maxWidth: 900 }}>
      <Typography variant="h4" gutterBottom>
        {t('settings.title')}
      </Typography>
      <Typography variant="body1" sx={{ mb: 1 }}>
        {t('settings.intro')}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('settings.perDevice')}
      </Alert>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          mb: 2,
        }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          }
          label={t('settings.enabled')}
        />
        <Button
          startIcon={<RestartAltIcon />}
          onClick={resetAll}
          disabled={!hasOverrides}
        >
          {t('settings.resetAll')}
        </Button>
      </Box>

      {conflicts.map((conflict) => (
        <Alert severity="warning" sx={{ mb: 1 }} key={conflict.binding}>
          {t('settings.conflict', {
            binding: formatBinding(conflict.binding, { mac }),
            actions: conflict.actions
              .map((id) => t(`actions.${id}`))
              .join(', '),
          })}
        </Alert>
      ))}

      {HOTKEY_GROUPS.map((group) => (
        <Paper key={group} sx={{ p: 2, mb: 2, opacity: enabled ? 1 : 0.6 }}>
          <Typography variant="h6" gutterBottom>
            {t(`groups.${group}`)}
          </Typography>
          {HOTKEY_ACTIONS.filter((action) => action.group === group).map(
            (action) => {
              const id = action.id as HotkeyActionId;
              const binding = bindings[id];
              const changed = Object.prototype.hasOwnProperty.call(overrides, id);
              const isRecording = recording === id;
              const label = t(`actions.${id}`);
              return (
                <Box
                  key={id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                    py: 1,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                    <Typography variant="body2">{label}</Typography>
                    {changed && (
                      <Typography variant="caption" color="text.secondary">
                        {t('settings.defaultIs', {
                          binding: formatBinding(action.defaultBinding, { mac }),
                        })}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ minWidth: 120 }}>
                    {isRecording ? (
                      <Typography variant="body2" color="primary" role="status">
                        {t('settings.recording')}
                      </Typography>
                    ) : binding ? (
                      <Box
                        sx={{
                          display: 'inline-flex',
                          outline: conflicting.has(id) ? 2 : 0,
                          outlineColor: 'warning.main',
                          borderRadius: 1,
                        }}
                      >
                        <HotkeyKbd label={formatBinding(binding, { mac })} />
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('settings.off')}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Button
                      size="small"
                      variant={isRecording ? 'contained' : 'outlined'}
                      startIcon={<KeyboardIcon />}
                      onClick={() => setRecording(isRecording ? undefined : id)}
                      aria-label={`${t('settings.change')}: ${label}`}
                    >
                      {isRecording ? t('settings.cancel') : t('settings.change')}
                    </Button>
                    <Tooltip title={t('settings.disable')}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!binding}
                          onClick={() => setBinding(id, null)}
                          aria-label={`${t('settings.disable')}: ${label}`}
                        >
                          <BlockIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('settings.reset')}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!changed}
                          onClick={() => resetBinding(id)}
                          aria-label={`${t('settings.reset')}: ${label}`}
                        >
                          <RestartAltIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              );
            },
          )}
        </Paper>
      ))}

      <Typography variant="body2" color="text.secondary">
        {t('help.rules')}
      </Typography>
    </Box>
  );
}
