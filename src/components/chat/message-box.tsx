import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { ChatMessage } from '../../common/chat';
import { formatTimestamp } from '../../common/time-format';

export default function MessageBox({ msg }: { msg: ChatMessage }) {
  return (
    <Card sx={{ minWidth: 275, margin: 2 }}>
      <CardContent>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
          {msg.name || msg.email} {formatTimestamp(msg.timestamp)}
        </Typography>
        {/* <Typography sx={{ mb: 1.5 }} color="text.secondary">
          {msg.name || msg.email}
        </Typography> */}
        <Typography variant="body2">{msg.message}</Typography>
      </CardContent>
      {/* <CardActions>
    <Button size="small">Learn More</Button>
  </CardActions> */}
    </Card>
  );
}
