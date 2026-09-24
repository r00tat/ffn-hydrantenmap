'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { clearNotes, removeNote } from '../../hooks/aiAssistant/assistantMemory';
import useAssistantMemory from '../../hooks/aiAssistant/useAssistantMemory';

interface AiMemoryNotesProps {
  firecallId: string | undefined;
}

/**
 * Was sich der Assistent auf diesem Gerät für den Einsatz gemerkt hat.
 *
 * Sichtbar, sobald es eine Notiz gibt: Eine vergessene Vorgabe („Messwerte in
 * Ebene 7") wirkt sonst unbemerkt weiter. Geändert wird per Sprache, hier nur
 * gelöscht.
 */
export default function AiMemoryNotes({ firecallId }: AiMemoryNotesProps) {
  const t = useTranslations('ai');
  const memory = useAssistantMemory(firecallId);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const notes = memory?.notes ?? [];

  if (!firecallId || notes.length === 0) return null;

  return (
    <>
      <Tooltip title={t('memoryTitle')}>
        <Fab
          size="small"
          aria-label={t('memoryButton', { count: notes.length })}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <Badge badgeContent={notes.length} color="primary">
            <StickyNote2Icon />
          </Badge>
        </Fab>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, maxWidth: 360 }}>
          <Typography variant="subtitle1">{t('memoryTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('memoryHint')}
          </Typography>
          <List dense>
            {notes.map((note) => (
              <ListItem
                key={note.id}
                disableGutters
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label={t('memoryForget')}
                    onClick={() => removeNote(firecallId, { noteId: note.id })}
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText primary={note.text} />
              </ListItem>
            ))}
          </List>
          <Button
            color="error"
            onClick={() => {
              clearNotes(firecallId);
              setAnchor(null);
            }}
          >
            {t('memoryForgetAll')}
          </Button>
        </Box>
      </Popover>
    </>
  );
}
