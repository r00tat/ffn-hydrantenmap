'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useState } from 'react';
import {
  formatCurrency,
  KostenersatzRate,
  KostenersatzTemplate,
  KostenersatzVersion,
} from '../../common/kostenersatz';
import {
  DEFAULT_RATES,
  DEFAULT_VERSION,
  getCategoryList,
} from '../../common/defaultKostenersatzRates';
import {
  useKostenersatzRates,
  useKostenersatzTemplates,
  useKostenersatzVersions,
} from '../../hooks/useKostenersatz';
import {
  useKostenersatzSeedDefaultRates,
  useKostenersatzTemplateDelete,
  useKostenersatzVersionSetActive,
} from '../../hooks/useKostenersatzMutations';
import KostenersatzTemplateDialog from './KostenersatzTemplateDialog';

export default function KostenersatzAdminSettings() {
  const { versions, activeVersion, loading: versionsLoading } = useKostenersatzVersions();
  const { rates, loading: ratesLoading } = useKostenersatzRates(activeVersion?.id);
  const { sharedTemplates, loading: templatesLoading } = useKostenersatzTemplates();

  const seedDefaultRates = useKostenersatzSeedDefaultRates();
  const setVersionActive = useKostenersatzVersionSetActive();
  const deleteTemplate = useKostenersatzTemplateDelete();

  const [seeding, setSeeding] = useState(false);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<KostenersatzTemplate | undefined>();
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const categories = getCategoryList(rates);

  const handleSeedRates = async () => {
    setSeeding(true);
    try {
      await seedDefaultRates(
        DEFAULT_VERSION,
        DEFAULT_RATES.map((rate) => ({
          ...rate,
          version: DEFAULT_VERSION.id,
          validFrom: DEFAULT_VERSION.validFrom,
        }))
      );
      setSeedDialogOpen(false);
    } catch (error) {
      console.error('Error seeding rates:', error);
    } finally {
      setSeeding(false);
    }
  };

  const handleSetVersionActive = async (versionId: string) => {
    try {
      await setVersionActive(versionId, versions);
    } catch (error) {
      console.error('Error setting version active:', error);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (confirm('Vorlage wirklich löschen?')) {
      try {
        await deleteTemplate(templateId);
      } catch (error) {
        console.error('Error deleting template:', error);
      }
    }
  };

  const handleEditTemplate = (template: KostenersatzTemplate) => {
    setEditingTemplate(template);
    setTemplateDialogOpen(true);
  };

  if (versionsLoading || ratesLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h5">Kostenersatz Einstellungen</Typography>

      {/* Versions Section */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Tarif-Versionen</Typography>
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => setSeedDialogOpen(true)}
              variant="outlined"
            >
              Standard-Tarife laden
            </Button>
          </Box>

          {versions.length === 0 ? (
            <Typography color="text.secondary">
              Keine Versionen vorhanden. Laden Sie die Standard-Tarife.
            </Typography>
          ) : (
            <List>
              {versions.map((version) => (
                <ListItem
                  key={version.id}
                  secondaryAction={
                    !version.isActive && (
                      <Button
                        size="small"
                        onClick={() => handleSetVersionActive(version.id)}
                      >
                        Aktivieren
                      </Button>
                    )
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {version.name}
                        {version.isActive && (
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Aktiv"
                            size="small"
                            color="success"
                          />
                        )}
                      </Box>
                    }
                    secondary={`Gültig ab: ${version.validFrom}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Rates Overview */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Aktuelle Tarife ({activeVersion?.name || 'Standard'})
          </Typography>

          {categories.map((category) => {
            const categoryRates = rates.filter((r) => r.categoryNumber === category.number);
            if (categoryRates.length === 0) return null;

            return (
              <Box key={category.number} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                  {category.number}. {category.name}
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nr.</TableCell>
                      <TableCell>Beschreibung</TableCell>
                      <TableCell>Einheit</TableCell>
                      <TableCell align="right">Preis/h</TableCell>
                      <TableCell align="right">Pauschal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {categoryRates.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell>{rate.id}</TableCell>
                        <TableCell>{rate.description}</TableCell>
                        <TableCell>{rate.unit}</TableCell>
                        <TableCell align="right">{formatCurrency(rate.price)}</TableCell>
                        <TableCell align="right">
                          {rate.pricePauschal ? formatCurrency(rate.pricePauschal) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* Shared Templates */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Gemeinsame Vorlagen
          </Typography>

          {templatesLoading ? (
            <CircularProgress size={20} />
          ) : sharedTemplates.length === 0 ? (
            <Typography color="text.secondary">
              Keine gemeinsamen Vorlagen vorhanden.
            </Typography>
          ) : (
            <List>
              {sharedTemplates.map((template) => (
                <ListItem
                  key={template.id}
                  secondaryAction={
                    <Box>
                      <IconButton
                        size="small"
                        onClick={() => handleEditTemplate(template)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => template.id && handleDeleteTemplate(template.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={template.name}
                    secondary={
                      template.description ||
                      `${template.items.length} Positionen${template.defaultStunden ? `, ${template.defaultStunden}h Standard` : ''}`
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Seed Dialog */}
      <Dialog open={seedDialogOpen} onClose={() => setSeedDialogOpen(false)}>
        <DialogTitle>Standard-Tarife laden</DialogTitle>
        <DialogContent>
          <Typography>
            Möchten Sie die Standard-Tarife (LGBl. Nr. 77/2023) in die Datenbank laden?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Dies erstellt eine neue Version &quot;{DEFAULT_VERSION.name}&quot; mit allen
            Standard-Tarifsätzen. Bestehende Versionen bleiben erhalten.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeedDialogOpen(false)} disabled={seeding}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            onClick={handleSeedRates}
            disabled={seeding}
          >
            {seeding ? <CircularProgress size={20} /> : 'Laden'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Template Edit Dialog */}
      {templateDialogOpen && (
        <KostenersatzTemplateDialog
          open={templateDialogOpen}
          onClose={() => {
            setTemplateDialogOpen(false);
            setEditingTemplate(undefined);
          }}
          existingTemplate={editingTemplate}
          isAdmin={true}
        />
      )}
    </Box>
  );
}
