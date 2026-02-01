'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import PersonIcon from '@mui/icons-material/Person';
import { useState } from 'react';
import { KostenersatzTemplate } from '../../common/kostenersatz';
import { useKostenersatzTemplates } from '../../hooks/useKostenersatz';
import { useKostenersatzTemplateDelete } from '../../hooks/useKostenersatzMutations';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import KostenersatzTemplateDialog from './KostenersatzTemplateDialog';

export interface KostenersatzTemplateSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: KostenersatzTemplate) => void;
}

export default function KostenersatzTemplateSelector({
  open,
  onClose,
  onSelect,
}: KostenersatzTemplateSelectorProps) {
  const { sharedTemplates, personalTemplates, loading } = useKostenersatzTemplates();
  const { email, isAdmin } = useFirebaseLogin();
  const deleteTemplate = useKostenersatzTemplateDelete();

  const [editingTemplate, setEditingTemplate] = useState<KostenersatzTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<KostenersatzTemplate | null>(null);

  const handleSelect = (template: KostenersatzTemplate) => {
    onSelect(template);
    onClose();
  };

  const canEditTemplate = (template: KostenersatzTemplate) => {
    // User can edit their own templates, admin can edit shared templates
    return template.createdBy === email || (isAdmin && template.isShared);
  };

  const handleDelete = async () => {
    if (!deletingTemplate?.id) return;
    try {
      await deleteTemplate(deletingTemplate.id);
      setDeletingTemplate(null);
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleEditClose = (saved?: boolean) => {
    setEditingTemplate(null);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Vorlage auswählen</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Typography>Laden...</Typography>
        ) : (
          <>
            {/* Personal Templates */}
            {personalTemplates.length > 0 && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <PersonIcon color="action" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Meine Vorlagen
                  </Typography>
                </Box>
                <List dense>
                  {personalTemplates.map((template) => (
                    <ListItem
                      key={template.id}
                      disablePadding
                      secondaryAction={
                        canEditTemplate(template) && (
                          <Box>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTemplate(template);
                              }}
                              title="Bearbeiten"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingTemplate(template);
                              }}
                              title="Löschen"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        )
                      }
                    >
                      <ListItemButton onClick={() => handleSelect(template)}>
                        <ListItemText
                          primary={template.name}
                          secondary={
                            template.description ||
                            `${template.items.length} Positionen${template.defaultStunden ? `, ${template.defaultStunden}h` : ''}`
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
                {sharedTemplates.length > 0 && <Divider sx={{ my: 2 }} />}
              </>
            )}

            {/* Shared Templates */}
            {sharedTemplates.length > 0 && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <FolderSharedIcon color="action" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Gemeinsame Vorlagen
                  </Typography>
                </Box>
                <List dense>
                  {sharedTemplates.map((template) => (
                    <ListItem
                      key={template.id}
                      disablePadding
                      secondaryAction={
                        canEditTemplate(template) && (
                          <Box>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTemplate(template);
                              }}
                              title="Bearbeiten"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingTemplate(template);
                              }}
                              title="Löschen"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        )
                      }
                    >
                      <ListItemButton onClick={() => handleSelect(template)}>
                        <ListItemText
                          primary={template.name}
                          secondary={
                            template.description ||
                            `${template.items.length} Positionen${template.defaultStunden ? `, ${template.defaultStunden}h` : ''}`
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {personalTemplates.length === 0 && sharedTemplates.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  Keine Vorlagen vorhanden
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Speichern Sie eine Berechnung als Vorlage, um sie hier zu sehen.
                </Typography>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
      </DialogActions>

      {/* Edit Template Dialog */}
      {editingTemplate && (
        <KostenersatzTemplateDialog
          open={!!editingTemplate}
          onClose={handleEditClose}
          existingTemplate={editingTemplate}
          isAdmin={isAdmin}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTemplate} onClose={() => setDeletingTemplate(null)}>
        <DialogTitle>Vorlage löschen?</DialogTitle>
        <DialogContent>
          <Typography>
            Möchten Sie die Vorlage &quot;{deletingTemplate?.name}&quot; wirklich löschen?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingTemplate(null)}>Abbrechen</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Löschen
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
