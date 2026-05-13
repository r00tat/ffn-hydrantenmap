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
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
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
  useKostenersatzRateDelete,
  useKostenersatzRateUpsert,
  useKostenersatzSeedDefaultRates,
  useKostenersatzTemplateDelete,
  useKostenersatzVersionSetActive,
} from '../../hooks/useKostenersatzMutations';
import { useKostenersatzEmailConfig } from '../../hooks/useKostenersatzEmailConfig';
import KostenersatzTemplateDialog from './KostenersatzTemplateDialog';
import SumUpTransactionList from './SumUpTransactionList';
import KostenersatzVehicleTab from './KostenersatzVehicleTab';
import Alert from '@mui/material/Alert';

export default function KostenersatzAdminSettings() {
  const t = useTranslations('kostenersatz.admin');
  const tCommon = useTranslations('common');
  const { versions, activeVersion, loading: versionsLoading } = useKostenersatzVersions();
  const { rates, loading: ratesLoading } = useKostenersatzRates(activeVersion?.id);
  const { sharedTemplates, loading: templatesLoading } = useKostenersatzTemplates();
  const { config: emailConfig, loading: emailConfigLoading, saveConfig: saveEmailConfig } = useKostenersatzEmailConfig();
  const seedDefaultRates = useKostenersatzSeedDefaultRates();
  const setVersionActive = useKostenersatzVersionSetActive();
  const deleteTemplate = useKostenersatzTemplateDelete();
  const upsertRate = useKostenersatzRateUpsert();
  const deleteRate = useKostenersatzRateDelete();

  const [activeTab, setActiveTab] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<KostenersatzTemplate | undefined>();
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  // Email settings state
  const [emailFromEdit, setEmailFromEdit] = useState('');
  const [emailCcEdit, setEmailCcEdit] = useState('');
  const [emailSubjectEdit, setEmailSubjectEdit] = useState('');
  const [emailBodyEdit, setEmailBodyEdit] = useState('');
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);
  const [emailConfigSaved, setEmailConfigSaved] = useState(false);
  const [emailConfigError, setEmailConfigError] = useState<string | null>(null);

  // Rate editing state
  const [editingRate, setEditingRate] = useState<KostenersatzRate | undefined>();
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [editedPrice, setEditedPrice] = useState<string>('');
  const [editedPricePauschal, setEditedPricePauschal] = useState<string>('');
  const [savingRate, setSavingRate] = useState(false);

  // Custom item state (for any category)
  const [customItemDialogOpen, setCustomItemDialogOpen] = useState(false);
  const [customItemCategory, setCustomItemCategory] = useState<{ number: number; name: string } | null>(null);
  const [customDescription, setCustomDescription] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [customPricePauschal, setCustomPricePauschal] = useState<string>('');
  const [savingCustomItem, setSavingCustomItem] = useState(false);

  const categories = getCategoryList(rates);

  // Initialize email settings from config
  useEffect(() => {
    if (!emailConfigLoading && emailConfig) {
      setEmailFromEdit(emailConfig.fromEmail);
      setEmailCcEdit(emailConfig.ccEmail);
      setEmailSubjectEdit(emailConfig.subjectTemplate);
      setEmailBodyEdit(emailConfig.bodyTemplate);
    }
  }, [emailConfig, emailConfigLoading]);

  // Email config save handler
  const handleSaveEmailConfig = async () => {
    setSavingEmailConfig(true);
    setEmailConfigError(null);
    setEmailConfigSaved(false);

    try {
      await saveEmailConfig({
        fromEmail: emailFromEdit,
        ccEmail: emailCcEdit,
        subjectTemplate: emailSubjectEdit,
        bodyTemplate: emailBodyEdit,
      });
      setEmailConfigSaved(true);
      setTimeout(() => setEmailConfigSaved(false), 3000);
    } catch (error) {
      console.error('Error saving email config:', error);
      setEmailConfigError('Fehler beim Speichern der E-Mail-Einstellungen.');
    } finally {
      setSavingEmailConfig(false);
    }
  };

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

  // Rate editing handlers
  const handleEditRate = (rate: KostenersatzRate) => {
    setEditingRate(rate);
    setEditedPrice(rate.price.toString());
    setEditedPricePauschal(rate.pricePauschal?.toString() || '');
    setRateDialogOpen(true);
  };

  const handleDeleteRate = async (rate: KostenersatzRate) => {
    if (confirm(`Tarif "${rate.id} - ${rate.description}" wirklich löschen?`)) {
      try {
        await deleteRate(rate.version, rate.id);
      } catch (error) {
        console.error('Error deleting rate:', error);
        alert('Fehler beim Löschen des Tarifs.');
      }
    }
  };

  const handleCloseRateDialog = () => {
    setRateDialogOpen(false);
    setEditingRate(undefined);
    setEditedPrice('');
    setEditedPricePauschal('');
  };

  const handleSaveRate = async () => {
    if (!editingRate || !activeVersion) return;

    const price = parseFloat(editedPrice);
    if (isNaN(price) || price < 0) {
      alert('Bitte geben Sie einen gültigen Preis ein.');
      return;
    }

    const pricePauschal = editedPricePauschal
      ? parseFloat(editedPricePauschal)
      : undefined;
    if (pricePauschal !== undefined && (isNaN(pricePauschal) || pricePauschal < 0)) {
      alert('Bitte geben Sie einen gültigen Pauschalpreis ein.');
      return;
    }

    setSavingRate(true);
    try {
      await upsertRate({
        ...editingRate,
        price,
        pricePauschal,
      });
      handleCloseRateDialog();
    } catch (error) {
      console.error('Error saving rate:', error);
      alert('Fehler beim Speichern des Tarifs.');
    } finally {
      setSavingRate(false);
    }
  };

  // Custom item handlers (for any category)
  const handleOpenCustomItemDialog = (category: { number: number; name: string }) => {
    setCustomItemCategory(category);
    setCustomDescription('');
    setCustomUnit('pauschal');
    setCustomPrice('');
    setCustomPricePauschal('');
    setCustomItemDialogOpen(true);
  };

  const handleCloseCustomItemDialog = () => {
    setCustomItemDialogOpen(false);
    setCustomItemCategory(null);
    setCustomDescription('');
    setCustomUnit('');
    setCustomPrice('');
    setCustomPricePauschal('');
  };

  const handleSaveCustomItem = async () => {
    if (!activeVersion || !customItemCategory) return;

    if (!customDescription.trim()) {
      alert('Bitte geben Sie eine Beschreibung ein.');
      return;
    }

    const price = parseFloat(customPrice);
    if (isNaN(price) || price < 0) {
      alert('Bitte geben Sie einen gültigen Preis ein.');
      return;
    }

    const pricePauschal = customPricePauschal
      ? parseFloat(customPricePauschal)
      : undefined;
    if (pricePauschal !== undefined && (isNaN(pricePauschal) || pricePauschal < 0)) {
      alert('Bitte geben Sie einen gültigen Pauschalpreis ein.');
      return;
    }

    // Determine category letter based on category number
    const getCategoryLetter = (catNum: number): 'A' | 'B' | 'C' | 'D' => {
      if (catNum >= 1 && catNum <= 9) return 'A';
      if (catNum === 10) return 'B';
      if (catNum === 11) return 'C';
      return 'D';
    };

    // Generate a unique ID for the custom item
    const categoryPrefix = `${customItemCategory.number}.`;
    const existingCustomIds = rates
      .filter((r) => r.categoryNumber === customItemCategory.number && r.id.startsWith(categoryPrefix))
      .map((r) => parseInt(r.id.split('.')[1]) || 0);
    const nextId = Math.max(0, ...existingCustomIds) + 1;
    const newId = `${customItemCategory.number}.${String(nextId).padStart(2, '0')}`;

    setSavingCustomItem(true);
    try {
      await upsertRate({
        id: newId,
        version: activeVersion.id,
        validFrom: activeVersion.validFrom,
        category: getCategoryLetter(customItemCategory.number),
        categoryNumber: customItemCategory.number,
        categoryName: customItemCategory.name,
        description: customDescription.trim(),
        unit: customUnit.trim() || 'pauschal',
        price,
        pricePauschal,
        isExtendable: true,
        sortOrder: customItemCategory.number * 100 + nextId,
      });
      handleCloseCustomItemDialog();
    } catch (error) {
      console.error('Error saving custom item:', error);
      alert('Fehler beim Speichern des Tarifs.');
    } finally {
      setSavingCustomItem(false);
    }
  };

  if (versionsLoading || ratesLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h5">{t('title')}</Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label={t('tabRates')} />
          <Tab label={t('tabVehicles')} />
          <Tab label={t('tabTemplates')} />
          <Tab label={t('tabEmail')} />
          <Tab label={t('tabSumup')} />
        </Tabs>
      </Box>

      {/* Tab 0: Tarife (Versions + Rates) */}
      {activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Versions Section */}
          <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('versions')}</Typography>
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => setSeedDialogOpen(true)}
              variant="outlined"
            >
              {t('loadDefaults')}
            </Button>
          </Box>

          {versions.length === 0 ? (
            <Typography color="text.secondary">{t('noVersions')}</Typography>
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
                        {t('activate')}
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
                            label={t('active')}
                            size="small"
                            color="success"
                          />
                        )}
                      </Box>
                    }
                    secondary={t('validFrom', { date: version.validFrom })}
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
            {t('currentRates', {
              version: activeVersion?.name || t('standard'),
            })}
          </Typography>

          {categories.map((category) => {
            const categoryRates = rates.filter((r) => r.categoryNumber === category.number);
            if (categoryRates.length === 0) return null;

            return (
              <Box key={category.number} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500 }} gutterBottom>
                  {category.number}. {category.name}
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('ratesCols.no')}</TableCell>
                      <TableCell>{t('ratesCols.description')}</TableCell>
                      <TableCell>{t('ratesCols.unit')}</TableCell>
                      <TableCell align="right">{t('ratesCols.pricePerHour')}</TableCell>
                      <TableCell align="right">{t('ratesCols.flatPrice')}</TableCell>
                      <TableCell align="center" sx={{ width: 50 }}></TableCell>
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
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditRate(rate)}
                            title={t('rateEditTooltip')}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteRate(rate)}
                            title={t('rateDeleteTooltip')}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* Add button for custom items in any category */}
                <Box sx={{ mt: 1 }}>
                  <Button
                    startIcon={<AddIcon />}
                    size="small"
                    onClick={() => handleOpenCustomItemDialog(category)}
                  >
                    {t('addCustomRate')}
                  </Button>
                </Box>
              </Box>
            );
          })}
        </CardContent>
      </Card>
        </Box>
      )}

      {/* Tab 1: Fahrzeuge */}
      {activeTab === 1 && <KostenersatzVehicleTab rates={rates} />}

      {/* Tab 2: Vorlagen */}
      {activeTab === 2 && (
        <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('sharedTemplates')}
          </Typography>

          {templatesLoading ? (
            <CircularProgress size={20} />
          ) : sharedTemplates.length === 0 ? (
            <Typography color="text.secondary">
              {t('noSharedTemplates')}
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
                      t('templateSecondary', {
                        count: template.items.length,
                        withDefault: template.defaultStunden ? 'true' : 'false',
                        hours: template.defaultStunden || 0,
                      })
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
      )}

      {/* Tab 3: E-Mail */}
      {activeTab === 3 && (
        <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('emailTitle')}
          </Typography>

          {emailConfigLoading ? (
            <CircularProgress size={20} />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {emailConfigSaved && (
                <Alert severity="success">{t('emailSaved')}</Alert>
              )}
              {emailConfigError && (
                <Alert severity="error">{emailConfigError}</Alert>
              )}

              <TextField
                label={t('emailFrom')}
                value={emailFromEdit}
                onChange={(e) => setEmailFromEdit(e.target.value)}
                fullWidth
                size="small"
                helperText={t('emailFromHelp')}
              />

              <TextField
                label={t('emailCc')}
                value={emailCcEdit}
                onChange={(e) => setEmailCcEdit(e.target.value)}
                fullWidth
                size="small"
                helperText={t('emailCcHelp')}
              />

              <TextField
                label={t('emailSubject')}
                value={emailSubjectEdit}
                onChange={(e) => setEmailSubjectEdit(e.target.value)}
                fullWidth
                size="small"
              />

              <TextField
                label={t('emailBody')}
                value={emailBodyEdit}
                onChange={(e) => setEmailBodyEdit(e.target.value)}
                fullWidth
                multiline
                rows={12}
              />

              <Box sx={{ backgroundColor: 'action.hover', p: 2, borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('availableVars')}
                </Typography>
                <Typography variant="body2" component="div" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {'{{ recipient.name }}'} - {t('varRecipientName')}<br />
                  {'{{ firecall.name }}'} - {t('varFirecallName')}<br />
                  {'{{ firecall.date }}'} - {t('varFirecallDate')}<br />
                  {'{{ calculation.totalSum }}'} - {t('varCalcTotal')}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleSaveEmailConfig}
                  disabled={savingEmailConfig}
                >
                  {savingEmailConfig ? <CircularProgress size={20} /> : t('save')}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
      )}

      {/* Tab 4: SumUp Transaktionen */}
      {activeTab === 4 && <SumUpTransactionList />}

      {/* Seed Dialog */}
      <Dialog open={seedDialogOpen} onClose={() => setSeedDialogOpen(false)}>
        <DialogTitle>{t('seedTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('seedConfirm')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('seedDetail', { name: DEFAULT_VERSION.name })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeedDialogOpen(false)} disabled={seeding}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSeedRates}
            disabled={seeding}
          >
            {seeding ? <CircularProgress size={20} /> : t('load')}
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
          rates={rates}
        />
      )}

      {/* Rate Edit Dialog */}
      <Dialog open={rateDialogOpen} onClose={handleCloseRateDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{t('rateEditTitle')}</DialogTitle>
        <DialogContent>
          {editingRate && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>{editingRate.id}</strong> - {editingRate.description}
              </Typography>
              <Divider />
              <TextField
                label={t('ratePrice')}
                type="number"
                value={editedPrice}
                onChange={(e) => setEditedPrice(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                fullWidth
              />
              <TextField
                label={t('rateFlatPrice')}
                type="number"
                value={editedPricePauschal}
                onChange={(e) => setEditedPricePauschal(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                fullWidth
                helperText={t('rateFlatHint')}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRateDialog} disabled={savingRate}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveRate}
            disabled={savingRate}
          >
            {savingRate ? <CircularProgress size={20} /> : t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Custom Item Dialog (any category) */}
      <Dialog open={customItemDialogOpen} onClose={handleCloseCustomItemDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {customItemCategory
            ? t('customItemTitleCategory', {
                number: customItemCategory.number,
                name: customItemCategory.name,
              })
            : t('customItemTitle')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('customItemIntro', { name: customItemCategory?.name || '' })}
            </Typography>
            <TextField
              label={t('customItemDescription')}
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              fullWidth
              required
              placeholder={t('customItemDescriptionPlaceholder')}
            />
            <TextField
              label={t('customItemUnit')}
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              fullWidth
              placeholder={t('customItemUnitPlaceholder')}
            />
            <TextField
              label={t('ratePrice')}
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              fullWidth
              required
            />
            <TextField
              label={t('rateFlatPrice')}
              type="number"
              value={customPricePauschal}
              onChange={(e) => setCustomPricePauschal(e.target.value)}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              fullWidth
              helperText={t('rateFlatHint')}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCustomItemDialog} disabled={savingCustomItem}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCustomItem}
            disabled={savingCustomItem || !customDescription.trim() || !customPrice}
          >
            {savingCustomItem ? <CircularProgress size={20} /> : tCommon('add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
