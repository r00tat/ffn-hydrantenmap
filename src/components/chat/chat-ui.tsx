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
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useRegisterMessaging, {
  useFirebaseMessagingToken,
  useUnRegisterMessaging,
} from '../../hooks/useRegisterMessaging';
import useSendMessage from '../../hooks/useSendMessage';
import ChatMessages from './messages';

export default function ChatUi() {
  // const [result, setResult] = useState<UserRecordExtended>();
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
    setNotificationsEnabled(
      (messagingTokens || []).indexOf('' + messagingToken) >= 0
    );
  }, [messagingToken, messagingTokens]);

  useEffect(() => {
    if (Notification.permission === 'default') {
      registerMessaging();
    }
  }, [registerMessaging]);

  return (
    <>
      <Typography variant="h3">Chat</Typography>
      <Grid container>
        <Grid size={{ xs: 12 }}>
          <FormControlLabel
            control={
              <Switch
                checked={notificationsEnabled}
                onChange={async (ev) => {
                  await (notificationsEnabled
                    ? unregisterMessaging()
                    : registerMessaging());
                  setNotificationsEnabled((prev) => !prev);
                }}
              />
            }
            label="Chat Benachrichtigungen"
          />
        </Grid>
        <Grid size={{ xs: 11 }}>
          <FormControl sx={{ m: 2 }} variant="outlined" fullWidth>
            <InputLabel htmlFor="outlined-adornment-password">
              Chat Message
            </InputLabel>
            <OutlinedInput
              margin="dense"
              id="chatmessage"
              label="Chat Message"
              type="text"
              fullWidth
              // variant="standard"
              onChange={(ev) => setText(ev.target.value)}
              value={text}
              onKeyDown={(ev) => {
                // console.info(`key down: ${ev.key} ${ev.key.charCodeAt(0)}`);
                ev.key === 'Enter' && sendChatMessage(text);
              }}
              endAdornment={
                <InputAdornment position="end">
                  <IconButton
                    aria-label="snd"
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
