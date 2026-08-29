'use client';

import { useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Fab from '@mui/material/Fab';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  ATEMSCHUTZ_GERAET_TYPEN,
  normalizeCode,
  lookupKeys,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
} from '../../../common/atemschutz';
import ConfirmDialog from '../../dialogs/ConfirmDialog';
import AtemschutzAdminGuard from './AtemschutzAdminGuard';
import useAtemschutzGeraete from '../../../hooks/useAtemschutzGeraete';
import useFahrtenbuchGroup from '../../../hooks/useFahrtenbuchGroup';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import {
  deleteAtemschutzGeraet,
  saveAtemschutzGeraet,
  type GeraetInput,
} from '../atemschutzActions';
import GeraetDialog from './GeraetDialog';
import GeraetImportDialog from './GeraetImportDialog';

type TypFilter = AtemschutzGeraetTyp | 'alle';

export default function AtemschutzAdmin() {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const { groups: allGroups, groupId, setGroupId } = useFahrtenbuchGroup();
  const { isAdmin, groupAdmin } = useFirebaseLogin();
  // Ein Gruppen-Admin verwaltet nur die Gruppen, in denen er eingetragen ist.
  // Keine Sicherheitsgrenze — die ist `actionGroupAdminRequired` in den
  // Actions; hier stehen bloß keine Gruppen zur Auswahl, die ohnehin abgewiesen
  // würden.
  const groups = useMemo(
    () =>
      isAdmin ? allGroups : allGroups.filter((g) => groupAdmin?.includes(g.id)),
    [allGroups, isAdmin, groupAdmin],
  );
  const { geraete, feuerwehren } = useAtemschutzGeraete(groupId);

  const [typFilter, setTypFilter] = useState<TypFilter>('alle');
  const [suche, setSuche] = useState('');
  const [zeigeInaktive, setZeigeInaktive] = useState(false);
  const [editGeraet, setEditGeraet] = useState<AtemschutzGeraet | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loeschKandidat, setLoeschKandidat] = useState<AtemschutzGeraet>();
  const [importOpen, setImportOpen] = useState(false);

  const gefiltert = useMemo(() => {
    // Die Suche geht über dieselben normalisierten Kennungen wie der Scanner:
    // Wer „2.16.19" tippt, soll dasselbe finden wie wer den Code scannt.
    const needle = normalizeCode(suche);
    return geraete.filter((g) => {
      if (!zeigeInaktive && g.active === false) return false;
      if (typFilter !== 'alle' && g.typ !== typFilter) return false;
      if (!needle) return true;
      if (lookupKeys(g).some((key) => key.includes(needle))) return true;
      return normalizeCode(g.bezeichnung).includes(needle);
    });
  }, [geraete, suche, typFilter, zeigeInaktive]);

  const handleSave = async (input: GeraetInput) => {
    if (!groupId) return;
    await saveAtemschutzGeraet(groupId, editGeraet?.id, input);
  };

  const handleDelete = async () => {
    if (!groupId || !loeschKandidat?.id) return;
    await deleteAtemschutzGeraet(groupId, loeschKandidat.id);
    setLoeschKandidat(undefined);
  };

  return (
    <AtemschutzAdminGuard>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {t('admin.title')}
          </Typography>
          <TextField
            select
            size="small"
            label={t('admin.group')}
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={groups.length === 0}
            sx={{ minWidth: 200 }}
          >
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {groups.length === 0 || !groupId ? (
          <Typography color="text.secondary">{t('admin.noGroups')}</Typography>
        ) : (
          <>
            <Stack
              direction="row"
              spacing={2}
              sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <TextField
                size="small"
                label={t('admin.search')}
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                sx={{ minWidth: 200 }}
              />
              <TextField
                select
                size="small"
                label={t('admin.filterTyp')}
                value={typFilter}
                onChange={(e) => setTypFilter(e.target.value as TypFilter)}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="alle">{t('admin.filterAll')}</MenuItem>
                {ATEMSCHUTZ_GERAET_TYPEN.map((typ) => (
                  <MenuItem key={typ} value={typ}>
                    {t(`typ.${typ}`)}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    checked={zeigeInaktive}
                    onChange={(e) => setZeigeInaktive(e.target.checked)}
                  />
                }
                label={t('admin.showInactive')}
              />
              <Box sx={{ flexGrow: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {t('admin.count', { count: gefiltert.length })}
              </Typography>
              <Button
                startIcon={<UploadFileIcon />}
                onClick={() => setImportOpen(true)}
              >
                {t('import.button')}
              </Button>
            </Stack>

            {gefiltert.length === 0 ? (
              <Typography color="text.secondary">{t('admin.empty')}</Typography>
            ) : (
              <List dense>
                {gefiltert.map((g) => (
                  <ListItem
                    key={g.id}
                    divider
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title={t('admin.edit', { name: g.bezeichnung })}>
                          <IconButton
                            edge="end"
                            onClick={() => {
                              setEditGeraet(g);
                              setDialogOpen(true);
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip
                          title={t('admin.delete', { name: g.bezeichnung })}
                        >
                          <IconButton edge="end" onClick={() => setLoeschKandidat(g)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <span>
                            {g.nummer ? `${g.nummer} · ` : ''}
                            {g.bezeichnung}
                          </span>
                          <Chip size="small" label={t(`typ.${g.typ}`)} />
                          {g.active === false && (
                            <Chip
                              size="small"
                              color="default"
                              variant="outlined"
                              label={t('admin.showInactive')}
                            />
                          )}
                        </Stack>
                      }
                      secondary={[g.feuerwehr, g.inventarNr, g.seriennummer]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            <Tooltip title={t('admin.add')}>
              <Fab
                color="primary"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={() => {
                  setEditGeraet(undefined);
                  setDialogOpen(true);
                }}
              >
                <AddIcon />
              </Fab>
            </Tooltip>

            {importOpen && (
              // `onDone` bleibt leer: `useAtemschutzGeraete` hängt an einem
              // Firestore-Listener und zieht die neuen Dokumente von selbst
              // nach — ein Neuladen von Hand wäre ein zweiter Weg, auf dem die
              // Liste veralten kann.
              <GeraetImportDialog
                open
                groupId={groupId}
                onClose={() => setImportOpen(false)}
                onDone={() => undefined}
              />
            )}

            {dialogOpen && (
              <GeraetDialog
                key={editGeraet?.id ?? 'new'}
                open={dialogOpen}
                geraet={editGeraet}
                feuerwehren={feuerwehren}
                onClose={() => setDialogOpen(false)}
                onSave={handleSave}
              />
            )}

            {/* `ConfirmDialog` hält sein `open` in eigenem State, der nur beim
                ersten Rendern gesetzt wird — deshalb bedingt gemountet statt
                dauerhaft mit `open={...}`. */}
            {loeschKandidat && (
              <ConfirmDialog
                title={tCommon('confirmTitle')}
                text={t('admin.deleteConfirm', {
                  name: loeschKandidat.bezeichnung,
                })}
                yes={tCommon('yes')}
                no={tCommon('no')}
                onConfirm={(confirmed) => {
                  if (confirmed) {
                    void handleDelete();
                  } else {
                    setLoeschKandidat(undefined);
                  }
                }}
              />
            )}
          </>
        )}
      </Container>
    </AtemschutzAdminGuard>
  );
}
