'use client';

import SendIcon from '@mui/icons-material/Send';
import { useCallback, useEffect, useState } from 'react';

import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useRegisterMessaging, {
  useFirebaseMessagingToken,
  useUnRegisterMessaging,
} from '../../hooks/useRegisterMessaging';
import useSendMessage from '../../hooks/useSendMessage';
import ChatMessages from './messages';

export default function ChatUi() {
  const t = useTranslations('chat');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { messagingTokens } = useFirebaseLogin();
  const messagingToken = useFirebaseMessagingToken();

  const registerMessaging = useRegisterMessaging();
  const unregisterMessaging = useUnRegisterMessaging();
  const sendMessage = useSendMessage();

  const [text, setText] = useState('');

  const sendChatMessage = useCallback(
    async (text: string) => {
      sendMessage(text);
      setText('');
    },
    [sendMessage]
  );

  useEffect(() => {
    (async () => {
      setNotificationsEnabled(
        (messagingTokens || []).indexOf('' + messagingToken) >= 0
      );
    })();
  }, [messagingToken, messagingTokens]);

  useEffect(() => {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      registerMessaging();
    }
  }, [registerMessaging]);

  return (
    <>
      <Typography variant="h3">{t('title')}</Typography>
      <Grid container>
        <Grid size={{ xs: 12 }}>
          <FormControlLabel
            control={
              <Switch
                checked={notificationsEnabled}
                onChange={async () => {
                  await (notificationsEnabled
                    ? unregisterMessaging()
                    : registerMessaging());
                  setNotificationsEnabled((prev) => !prev);
                }}
              />
            }
            label={t('notifications')}
          />
        </Grid>
        <Grid size={{ xs: 11 }}>
          <FormControl sx={{ m: 2 }} variant="outlined" fullWidth>
            <InputLabel htmlFor="outlined-adornment-password">
              {t('messageLabel')}
            </InputLabel>
            <OutlinedInput
              margin="dense"
              id="chatmessage"
              label={t('messageLabel')}
              type="text"
              fullWidth
              onChange={(ev) => setText(ev.target.value)}
              value={text}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') sendChatMessage(text);
              }}
              endAdornment={
                <InputAdornment position="end">
                  <IconButton
                    aria-label={t('sendAria')}
                    onClick={() => sendChatMessage(text)}
                    edge="end"
                  >
                    <SendIcon />
                  </IconButton>
                </InputAdornment>
              }
            />
          </FormControl>
        </Grid>

        {/* <Grid size={{xs:12}}>
          <Typography>Register: {JSON.stringify(result)}</Typography>
        </Grid> */}

        <Grid size={{ xs: 12 }}>
          <ChatMessages />
        </Grid>
      </Grid>
    </>
  );
}
