'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { KostenersatzTemplate } from '../../common/kostenersatz';
import {
  useKostenersatzTemplateAdd,
  useKostenersatzTemplateUpdate,
} from '../../hooks/useKostenersatzMutations';

export interface KostenersatzTemplateDialogProps {
  open: boolean;
  onClose: (saved?: boolean) => void;
  existingTemplate?: KostenersatzTemplate;
  isAdmin?: boolean;
}

export default function KostenersatzTemplateDialog({
  open,
  onClose,
  existingTemplate,
  isAdmin = false,
}: KostenersatzTemplateDialogProps) {
  const [name, setName] = useState(existingTemplate?.name || '');
  const [description, setDescription] = useState(existingTemplate?.description || '');
  const [isShared, setIsShared] = useState(existingTemplate?.isShared || false);
  const [isSaving, setIsSaving] = useState(false);

  const addTemplate = useKostenersatzTemplateAdd();
  const updateTemplate = useKostenersatzTemplateUpdate();

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      if (existingTemplate?.id) {
        await updateTemplate({
          ...existingTemplate,
          name: name.trim(),
          description: description.trim() || undefined,
          isShared,
        });
      } else {
        await addTemplate({
          name: name.trim(),
          description: description.trim() || undefined,
          isShared,
          items: existingTemplate?.items || [],
          defaultStunden: existingTemplate?.defaultStunden,
        });
      }
      onClose(true);
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>
        {existingTemplate?.id ? 'Vorlage bearbeiten' : 'Vorlage speichern'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Name der Vorlage"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Beschreibung (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          {isAdmin && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                />
              }
              label="Für alle Benutzer freigeben (gemeinsame Vorlage)"
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={isSaving}>
          Abbrechen
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
        >
          Speichern
        </Button>
      </DialogActions>
    </Dialog>
  );
}
