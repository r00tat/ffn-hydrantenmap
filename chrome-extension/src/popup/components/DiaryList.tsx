import {
  Box,
  List,
  ListItem,
  ListItemText,
  Typography,
  Chip,
  Skeleton,
} from '@mui/material';
import { Diary } from '@shared/types';

const ART_LABELS: Record<
  string,
  { label: string; color: 'info' | 'warning' | 'success' }
> = {
  M: { label: 'Meldung', color: 'info' },
  B: { label: 'Befehl', color: 'warning' },
  F: { label: 'Frage', color: 'success' },
};

interface DiaryListProps {
  diaries: Diary[];
  loading: boolean;
}

export default function DiaryList({ diaries, loading }: DiaryListProps) {
  if (loading) {
    return (
      <Box sx={{ p: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={60} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (diaries.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Keine Tagebucheinträge vorhanden.
        </Typography>
      </Box>
    );
  }

  return (
    <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
      {diaries.map((entry) => {
        const artInfo = entry.art ? ART_LABELS[entry.art] : undefined;
        const timestamp = entry.datum
          ? new Date(entry.datum).toLocaleString('de-AT', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit',
            })
          : '';

        return (
          <ListItem key={entry.id} divider>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 'bold', mr: 0.5 }}
                  >
                    #{entry.nummer}
                  </Typography>
                  {artInfo && (
                    <Chip
                      label={artInfo.label}
                      color={artInfo.color}
                      size="small"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {entry.name}
                  </Typography>
                </Box>
              }
              secondary={
                <Typography variant="caption" color="text.secondary">
                  {timestamp}
                  {entry.von && ` \u2014 Von: ${entry.von}`}
                  {entry.an && ` \u2192 An: ${entry.an}`}
                </Typography>
              }
            />
          </ListItem>
        );
      })}
    </List>
  );
}
