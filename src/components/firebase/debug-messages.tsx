import ChatIcon from '@mui/icons-material/Chat';
import { Alert, Snackbar } from '@mui/material';
import { useState } from 'react';
import { DebugMessage, useDebugLogging } from '../../hooks/useDebugging';

export function MessageSnack({
  msg,
  onClose,
}: {
  msg: DebugMessage;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <Snackbar
      open={isOpen}
      autoHideDuration={5000}
      key={'dm-snack-' + msg.id}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      onClose={() => {
        setIsOpen(false);
        onClose();
      }}
      onClick={() => {
        setIsOpen(false);
        onClose();
      }}
    >
      <Alert
        onClose={() => {
          setIsOpen(false);
          onClose();
        }}
        severity={
          msg?.properties?.level === 'ERROR'
            ? 'error'
            : msg?.properties?.level === 'WARN'
            ? 'warning'
            : 'info'
        }
        sx={{ width: '100%' }}
        icon={<ChatIcon />}
      >
        {msg.message} {msg.properties && JSON.stringify(msg.properties)}
      </Alert>
    </Snackbar>
  );
}

export default function DebugMessageDisplay() {
  const { messages, removeMessage, displayMessages } = useDebugLogging();

  return (
    <>
      {displayMessages &&
        messages.map((m) => (
          <MessageSnack
            msg={m}
            key={m.id}
            onClose={() => removeMessage(m.id)}
          />
        ))}
    </>
  );
}
