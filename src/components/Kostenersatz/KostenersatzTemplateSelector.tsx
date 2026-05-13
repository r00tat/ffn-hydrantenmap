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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { KostenersatzTemplate } from '../../common/kostenersatz';
import { useKostenersatzRates, useKostenersatzTemplates } from '../../hooks/useKostenersatz';
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
  const t = useTranslations('kostenersatz.templateSelector');
  const tCommon = useTranslations('common');
  const { sharedTemplates, personalTemplates, loading } = useKostenersatzTemplates();
  const { rates } = useKostenersatzRates();
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
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Typography>{t('loading')}</Typography>
        ) : (
          <>
            {/* Personal Templates */}
            {personalTemplates.length > 0 && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <PersonIcon color="action" />
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('myTemplates')}
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
                              title={t('edit')}
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
                              title={t('delete')}
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
                            t('secondary', {
                              count: template.items.length,
                              withDefault: template.defaultStunden ? 'true' : 'false',
                              hours: template.defaultStunden || 0,
                            })
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
                    {t('sharedTemplates')}
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
                              title={t('edit')}
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
                              title={t('delete')}
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
                            t('secondary', {
                              count: template.items.length,
                              withDefault: template.defaultStunden ? 'true' : 'false',
                              hours: template.defaultStunden || 0,
                            })
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
                  {t('noTemplates')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('noTemplatesHint')}
                </Typography>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
      </DialogActions>

      {/* Edit Template Dialog */}
      {editingTemplate && (
        <KostenersatzTemplateDialog
          open={!!editingTemplate}
          onClose={handleEditClose}
          existingTemplate={editingTemplate}
          isAdmin={isAdmin}
          rates={rates}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTemplate} onClose={() => setDeletingTemplate(null)}>
        <DialogTitle>{t('deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('deleteConfirm', { name: deletingTemplate?.name || '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingTemplate(null)}>{tCommon('cancel')}</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            {tCommon('delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
