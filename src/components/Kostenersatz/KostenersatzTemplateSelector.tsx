'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import PersonIcon from '@mui/icons-material/Person';
import { KostenersatzTemplate } from '../../common/kostenersatz';
import { useKostenersatzTemplates } from '../../hooks/useKostenersatz';

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

  const handleSelect = (template: KostenersatzTemplate) => {
    onSelect(template);
    onClose();
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
                    <ListItemButton
                      key={template.id}
                      onClick={() => handleSelect(template)}
                    >
                      <ListItemText
                        primary={template.name}
                        secondary={
                          template.description ||
                          `${template.items.length} Positionen${template.defaultStunden ? `, ${template.defaultStunden}h` : ''}`
                        }
                      />
                    </ListItemButton>
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
                    <ListItemButton
                      key={template.id}
                      onClick={() => handleSelect(template)}
                    >
                      <ListItemText
                        primary={template.name}
                        secondary={
                          template.description ||
                          `${template.items.length} Positionen${template.defaultStunden ? `, ${template.defaultStunden}h` : ''}`
                        }
                      />
                    </ListItemButton>
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
    </Dialog>
  );
}
