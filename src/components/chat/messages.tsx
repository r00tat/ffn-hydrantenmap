import Grid from '@mui/material/Grid2';
import { orderBy } from 'firebase/firestore';
import { ChatMessage } from '../../common/chat';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import MessageBox from './message-box';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
export interface ChatMessagesProps {
  order?: 'asc' | 'desc';
}
export default function ChatMessages({ order = 'desc' }: ChatMessagesProps) {
  const firecallId = useFirecallId();

  const messages = useFirebaseCollection<ChatMessage>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, 'chat'],
    queryConstraints: [orderBy('timestamp', order)],
  });

  return (
    <>
      <Grid container>
        {messages.map((m) => (
          <Grid size={{ xs: 12 }} key={m.id}>
            <MessageBox msg={m} />
          </Grid>
        ))}
      </Grid>
    </>
  );
}
