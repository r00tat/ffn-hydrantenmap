import SendIcon from '@mui/icons-material/Send';
import {
  Button,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  Switch,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import ChatMessages from './messages';
import useSendMessage from '../../hooks/useSendMessage';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useRegisterMessaging, {
  useFirebaseMessagingToken,
  useUnRegisterMessaging,
} from '../../hooks/useRegisterMessaging';

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
        <Grid item xs={12}>
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
        <Grid item xs={12}>
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

        {/* <Grid item xs={12}>
          <Typography>Register: {JSON.stringify(result)}</Typography>
        </Grid> */}

        <Grid item xs={12}>
          <ChatMessages />
        </Grid>
      </Grid>
    </>
  );
}
