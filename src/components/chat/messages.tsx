import { Grid } from '@mui/material';
import { orderBy } from 'firebase/firestore';
import { ChatMessage } from '../../common/chat';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import MessageBox from './message-box';
export interface ChatMessagesProps {
  order?: 'asc' | 'desc';
}
export default function ChatMessages({ order = 'desc' }: ChatMessagesProps) {
  const firecallId = useFirecallId();

  const messages = useFirebaseCollection<ChatMessage>({
    collectionName: 'call',
    pathSegments: [firecallId, 'chat'],
    queryConstraints: [orderBy('timestamp', order)],
  });

  return (
    <>
      <Grid container>
        {messages.map((m) => (
          <Grid item xs={12} key={m.id}>
            <MessageBox msg={m} />
          </Grid>
        ))}
      </Grid>
    </>
  );
}
