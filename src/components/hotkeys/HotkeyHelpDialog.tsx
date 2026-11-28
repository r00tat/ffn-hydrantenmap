'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  HOTKEY_ACTIONS,
  HOTKEY_GROUPS,
  formatBinding,
  type HotkeyActionId,
} from '../../common/hotkeys';
import HotkeyKbd from './HotkeyKbd';
import { useHotkeys } from './HotkeyProvider';
import { useIsMac } from './useHotkeyLabel';

/** Übersicht der aktiven Tastenkürzel (Kürzel `?`). */
export default function HotkeyHelpDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('hotkeys');
  const tCommon = useTranslations('common');
  const { bindings, enabled } = useHotkeys();
  const mac = useIsMac();

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('help.title')}</DialogTitle>
      <DialogContent>
        {!enabled && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('help.disabled')}
          </Alert>
        )}
        {HOTKEY_GROUPS.map((group) => {
          const actions = HOTKEY_ACTIONS.filter(
            (action) => action.group === group && bindings[action.id],
          );
          if (actions.length === 0) return null;
          return (
            <Box key={group} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {t(`groups.${group}`)}
              </Typography>
              {actions.map((action) => (
                <Box
                  key={action.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    py: 0.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2">
                    {t(`actions.${action.id as HotkeyActionId}`)}
                  </Typography>
                  <HotkeyKbd label={formatBinding(bindings[action.id], { mac })} />
                </Box>
              ))}
            </Box>
          );
        })}
        <Typography variant="body2" color="text.secondary">
          {t('help.rules')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button component={Link} href="/tastenkuerzel" onClick={onClose}>
          {t('help.customize')}
        </Button>
        <Button onClick={onClose} variant="contained">
          {tCommon('close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
