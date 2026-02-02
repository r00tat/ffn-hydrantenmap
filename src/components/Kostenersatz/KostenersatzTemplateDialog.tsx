'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import { useState, useEffect } from 'react';
import {
  KostenersatzTemplate,
  KostenersatzLineItem,
  KostenersatzRate,
  KostenersatzTemplateItem,
} from '../../common/kostenersatz';
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
  /** Rates for displaying item descriptions when editing */
  rates?: KostenersatzRate[];
}

export default function KostenersatzTemplateDialog({
  open,
  onClose,
  existingTemplate,
  calculationItems,
  calculationDefaultStunden,
  isAdmin = false,
  rates = [],
}: KostenersatzTemplateDialogProps) {
  const [name, setName] = useState(existingTemplate?.name || '');
  const [description, setDescription] = useState(existingTemplate?.description || '');
  const [isShared, setIsShared] = useState(existingTemplate?.isShared || false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedItems, setEditedItems] = useState<KostenersatzTemplateItem[]>([]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(existingTemplate?.name || '');
      setDescription(existingTemplate?.description || '');
      setIsShared(existingTemplate?.isShared || false);
      // Initialize edited items from existing template or calculation
      if (calculationItems) {
        setEditedItems(
          calculationItems.map((item) => ({ rateId: item.rateId, einheiten: item.einheiten }))
        );
      } else if (existingTemplate?.items) {
        setEditedItems([...existingTemplate.items]);
      } else {
        setEditedItems([]);
      }
    }
  }, [open, existingTemplate, calculationItems]);

  // Helper to get rate description
  const getRateDescription = (rateId: string): string => {
    const rate = rates.find((r) => r.id === rateId);
    return rate ? `${rate.id} - ${rate.description}` : rateId;
  };

  // Remove item from template
  const handleRemoveItem = (index: number) => {
    setEditedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Update item count
  const handleUpdateItemCount = (index: number, newCount: number) => {
    setEditedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, einheiten: newCount } : item))
    );
  };

  const addTemplate = useKostenersatzTemplateAdd();
  const updateTemplate = useKostenersatzTemplateUpdate();

  const defaultStundenToSave = calculationItems
    ? calculationDefaultStunden
    : existingTemplate?.defaultStunden;

  const itemCount = editedItems.length;

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
          items: editedItems,
        });
      } else {
        await addTemplate({
          name: name.trim(),
          ...(trimmedDescription && { description: trimmedDescription }),
          isShared,
          items: editedItems,
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
          {/* Show items list when editing existing template */}
          {existingTemplate?.id && editedItems.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Positionen ({editedItems.length})
              </Typography>
              <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
                {editedItems.map((item, index) => (
                  <ListItem
                    key={`${item.rateId}-${index}`}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleRemoveItem(index)}
                        title="Position entfernen"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={getRateDescription(item.rateId)}
                      secondary={
                        <TextField
                          type="number"
                          size="small"
                          value={item.einheiten}
                          onChange={(e) =>
                            handleUpdateItemCount(index, Math.max(1, parseInt(e.target.value) || 1))
                          }
                          slotProps={{ htmlInput: { min: 1, step: 1 } }}
                          sx={{ width: 80, mt: 0.5 }}
                          label="Einheiten"
                        />
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
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
