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
import Typography from '@mui/material/Typography';
import { useState, useEffect } from 'react';
import { KostenersatzTemplate, KostenersatzLineItem } from '../../common/kostenersatz';
import {
  useKostenersatzTemplateAdd,
  useKostenersatzTemplateUpdate,
} from '../../hooks/useKostenersatzMutations';

export interface KostenersatzTemplateDialogProps {
  open: boolean;
  onClose: (saved?: boolean) => void;
  existingTemplate?: KostenersatzTemplate;
  /** For creating a new template from a calculation */
  calculationItems?: KostenersatzLineItem[];
  calculationDefaultStunden?: number;
  isAdmin?: boolean;
}

export default function KostenersatzTemplateDialog({
  open,
  onClose,
  existingTemplate,
  calculationItems,
  calculationDefaultStunden,
  isAdmin = false,
}: KostenersatzTemplateDialogProps) {
  const [name, setName] = useState(existingTemplate?.name || '');
  const [description, setDescription] = useState(existingTemplate?.description || '');
  const [isShared, setIsShared] = useState(existingTemplate?.isShared || false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(existingTemplate?.name || '');
      setDescription(existingTemplate?.description || '');
      setIsShared(existingTemplate?.isShared || false);
    }
  }, [open, existingTemplate]);

  const addTemplate = useKostenersatzTemplateAdd();
  const updateTemplate = useKostenersatzTemplateUpdate();

  // Determine items to save: from calculation or existing template
  const itemsToSave = calculationItems
    ? calculationItems.map((item) => ({ rateId: item.rateId, einheiten: item.einheiten }))
    : existingTemplate?.items || [];

  const defaultStundenToSave = calculationItems
    ? calculationDefaultStunden
    : existingTemplate?.defaultStunden;

  const itemCount = itemsToSave.length;

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const trimmedDescription = description.trim();
      if (existingTemplate?.id) {
        await updateTemplate({
          ...existingTemplate,
          name: name.trim(),
          description: trimmedDescription || '', // Use empty string, not undefined
          isShared,
        });
      } else {
        await addTemplate({
          name: name.trim(),
          ...(trimmedDescription && { description: trimmedDescription }),
          isShared,
          items: itemsToSave,
          defaultStunden: defaultStundenToSave,
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
          {calculationItems && (
            <Typography variant="body2" color="text.secondary">
              {itemCount} Position{itemCount !== 1 ? 'en' : ''} werden als Vorlage gespeichert
              {defaultStundenToSave ? ` (${defaultStundenToSave}h Standarddauer)` : ''}.
            </Typography>
          )}
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
