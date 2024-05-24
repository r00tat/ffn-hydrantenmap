'use client';

import ChatIcon from '@mui/icons-material/Chat';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ChatMessage } from '../../common/chat';
import { useMessaging } from '../../hooks/useMessaging';

export function MessageSnack({
  msg,
  onClose,
}: {
  msg: ChatMessage;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const router = useRouter();
  return (
    <Snackbar
      open={isOpen}
      autoHideDuration={5000}
      key={'m-snack-' + msg.id}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      onClose={() => {
        setIsOpen(false);
        onClose();
      }}
      onClick={() => {
        setIsOpen(false);
        onClose();
        router.push('/chat');
      }}
    >
      <Alert
        onClose={() => {
          setIsOpen(false);
          onClose();
        }}
        severity="info"
        sx={{ width: '100%' }}
        icon={<ChatIcon />}
      >
        {msg.name}: {msg.message}
      </Alert>
    </Snackbar>
  );
}

export default function ChatMessageDisplay() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // const router = useRouter();

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((old) => {
      if (old.find((v) => v.id === msg.id)) {
        return old;
      }
      return [...old, msg];
    });
  }, []);

  // const registerMessaging = useRegisterMessaging();
  const message = useMessaging();

  useEffect(() => {
    if (message && message.data) {
      console.info(`received a message: ${JSON.stringify(message)}`);
      addMessage(message.data as unknown as ChatMessage);
    }
  }, [addMessage, message]);

  // useEffect(() => {
  //   registerMessaging();
  // }, [registerMessaging]);

  const removeMessage = useCallback((id?: string) => {
    if (id) {
      setMessages((old) => old.filter((v) => v.id !== id));
    }
  }, []);

  return (
    <>
      {messages.map((m) => (
        <MessageSnack msg={m} key={m.id} onClose={() => removeMessage(m.id)} />
      ))}
    </>
  );
}
