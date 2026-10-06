'use client';

import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SearchIcon from '@mui/icons-material/Search';
import ShareIcon from '@mui/icons-material/Share';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import Fab from '@mui/material/Fab';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { doc, orderBy, where } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { setDocLocal } from '../../lib/firestoreClient';
import FirecallLink from '../site/FirecallLink';
import useFirecallNavigate from '../../hooks/useFirecallNavigate';
import { useCallback, useMemo, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { useFirebaseCollectionState } from '../../hooks/useFirebaseCollection';
import OfflineListHint from '../site/OfflineListHint';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId, useFirecallSelect } from '../../hooks/useFirecall';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import FirecallShareDialog from '../firecallShare/FirecallShareDialog';
import { isGroupAdmin } from '../../common/groupPermissions';
import FirecallExport from '../firebase/FirecallExport';
import LagekarteExport from '../firebase/LagekarteExport';
import FirecallImport from '../firebase/FirecallImport';
import { firestore } from '../firebase/firebase';
import { FIRECALL_COLLECTION_ID, Firecall } from '../firebase/firestore';
import { KostenersatzList } from '../Kostenersatz';
import { useAuditLog } from '../../hooks/useAuditLog';
import {
  filterFirecalls,
  FirecallYearGroup,
  groupFirecallsByYear,
} from './einsaetzeList';

const yearKey = (group: FirecallYearGroup) => String(group.year ?? 'none');

function useFirecallUpdate() {
  const { email } = useFirebaseLogin();
  const logChange = useAuditLog();
  return useCallback(
    async (einsatz: Firecall) => {
      console.info(
        `update of einsatz ${einsatz.id}: ${JSON.stringify(einsatz)}`
      );
      setDocLocal(
        doc(firestore, FIRECALL_COLLECTION_ID, '' + einsatz.id),
        { ...einsatz, updatedAt: new Date().toISOString(), updatedBy: email },
        { merge: true }
      );

      logChange({
        action: 'update',
        elementType: 'firecall',
        elementId: einsatz.id || '',
        elementName: einsatz.name || '',
        firecallId: einsatz.id,
        newValue: { name: einsatz.name, description: einsatz.description, date: einsatz.date, eintreffen: einsatz.eintreffen, abruecken: einsatz.abruecken },
      });
    },
    [email, logChange]
  );
}

function EinsatzCard({
  einsatz,
  firecallId,
}: {
  einsatz: Firecall;
  firecallId?: string;
}) {
  const t = useTranslations();
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [kostenersatzOpen, setKostenersatzOpen] = useState(false);
  const updateFirecall = useFirecallUpdate();
  const { isAdmin, groups, groupAdmin } = useFirebaseLogin();
  const setFirecallId = useFirecallSelect();
  const navigate = useFirecallNavigate();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const updateFn = useCallback(
    (fzg?: Firecall) => {
      setDisplayUpdateDialog(false);
      if (fzg) {
        updateFirecall(fzg);
      }
    },
    [updateFirecall]
  );
  const deleteFn = useCallback(
    (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateFirecall({ ...einsatz, deleted: true });
      }
    },
    [updateFirecall, einsatz]
  );


  return (
    <Grid size={{ xs: 12, md: 6, lg: 4 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="div">
            <FirecallLink href={`/einsatz/${einsatz.id}/details`} style={{ textDecoration: 'none', color: 'inherit' }}>
              {einsatz.name} {einsatz.fw}{' '}
              {firecallId === einsatz.id ? t('einsaetze.active') : ''}
            </FirecallLink>
          </Typography>
          <Typography sx={{ mb: 1.5 }} color="text.secondary">
            {formatTimestamp(einsatz.date)}
          </Typography>
          {/* Nur der positive Fall: Ein Einsatz, für den nie eine Fahrt
              geschrieben wurde, trägt das Feld gar nicht — „0 Fahrten" wäre
              dort eine Behauptung, die auch für einen Einsatz von vor der
              Zählung gälte, dessen Fahrten längst im Fahrtenbuch stehen.
              Fehlender Chip heißt „nichts bekannt", nicht „keine Fahrten".
              Nachgezogen wird der Zähler beim Öffnen der Einsatzseite. */}
          {!!einsatz.fahrtenbuchEntryCount && (
            <Chip
              component={FirecallLink}
              href={`/einsatz/${einsatz.id}/fahrtenbuch`}
              clickable
              size="small"
              color="success"
              variant="outlined"
              icon={<DirectionsCarIcon />}
              sx={{ mb: 1.5 }}
              label={t('einsaetze.fahrtenRecorded', {
                count: einsatz.fahrtenbuchEntryCount,
              })}
            />
          )}
          <Typography variant="body2">{einsatz.description}</Typography>
        </CardContent>
        <CardActions>
          <Tooltip title={t('einsaetze.activate')}>
            <Button
              size="small"
              onClick={() => {
                if (setFirecallId) {
                  setFirecallId(einsatz.id);
                }
                navigate(`/einsatz/${einsatz.id}`);
              }}
            >
              {t('einsaetze.activateButton')}
            </Button>
          </Tooltip>
          <Tooltip title={t('einsaetze.detailsTooltip')}>
            <IconButton
              size="small"
              component={FirecallLink}
              href={`/einsatz/${einsatz.id}/details`}
            >
              <InfoIcon />
            </IconButton>
          </Tooltip>
          {einsatz.id && <FirecallExport firecallId={einsatz.id} />}
          {einsatz.id && <LagekarteExport firecallId={einsatz.id} />}

          <Tooltip title={t('common.edit')}>
            <IconButton
              size="small"
              onClick={() => setDisplayUpdateDialog(true)}
            >
              <EditIcon />
            </IconButton>
          </Tooltip>
          {/* Löschen darf, wer die Gruppe des Einsatzes administriert —
              globaler Admin oder Gruppen-Admin. */}
          {isGroupAdmin(einsatz.group ?? '', {
            isAdmin,
            groups,
            groupAdmin,
          }) && (
            <Tooltip title={t('common.delete')}>
              <IconButton
                size="small"
                onClick={() => setIsConfirmOpen(true)}
                color="error"
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t('einsaetze.shareTooltip')}>
            <IconButton
              size="small"
              onClick={() => setShareDialogOpen(true)}
            >
              <ShareIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('einsaetze.kostenersatzTooltip')}>
            <IconButton
              size="small"
              onClick={() => setKostenersatzOpen(true)}
              color="primary"
            >
              <ReceiptLongIcon />
            </IconButton>
          </Tooltip>
        </CardActions>
      </Card>
      {displayUpdateDialog && (
        <EinsatzDialog onClose={updateFn} einsatz={einsatz} />
      )}
      {shareDialogOpen && einsatz.id && (
        <FirecallShareDialog
          firecallId={einsatz.id}
          onClose={() => setShareDialogOpen(false)}
        />
      )}
      {isConfirmOpen && (
        <ConfirmDialog
          title={t('einsaetze.deleteTitle', {
            name: einsatz.name,
            date: einsatz.date || '',
          })}
          text={t('einsaetze.deleteConfirm', {
            name: einsatz.name,
            date: einsatz.date || '',
          })}
          onConfirm={deleteFn}
        />
      )}
      <Drawer
        anchor="right"
        open={kostenersatzOpen}
        onClose={() => setKostenersatzOpen(false)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 500, md: 600 }, p: 2 } } }}
      >
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{einsatz.name}</Typography>
          <Button onClick={() => setKostenersatzOpen(false)}>
            {t('common.close')}
          </Button>
        </Box>
        {einsatz.id && (
          <KostenersatzList firecallId={einsatz.id} />
        )}
      </Drawer>
    </Grid>
  );
}

export default function Einsaetze() {
  const t = useTranslations();
  const { isAuthorized, groups, myGroups } = useFirebaseLogin();
  const [einsatzDialog, setEinsatzDialog] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>('all');

  const filterFn = useCallback(
    (g: Firecall) =>
      g.deleted === false && (groupFilter === 'all' || g.group === groupFilter),
    [groupFilter]
  );

  // const columns = useGridColumns();
  const firecallId = useFirecallId();
  const { records: einsaetze, fromCache } = useFirebaseCollectionState<Firecall>({
    // Für den Offline-Hinweis: meldet auch den Wechsel vom Cache- zum
    // Server-Stand (siehe OfflineListHint).
    includeMetadataChanges: true,
    collectionName: FIRECALL_COLLECTION_ID,
    // pathSegments: [firecallId || 'unknown', FIRECALL_ITEMS_COLLECTION_ID],
    queryConstraints: [
      where('deleted', '==', false),
      where('group', 'in', groups),
      // where('group', '==', 'ffnd'),
      orderBy('date', 'desc'),
      // where('type', '==', 'einsatz'),
      // orderBy('fw'),
      // orderBy('name'),
      // where('deleted', '!=', false),
    ],
    filterFn,
  });

  const [search, setSearch] = useState('');
  // Nur was der Benutzer selbst auf- oder zugeklappt hat. Ohne Eintrag gilt:
  // das neueste Jahr offen, ältere zu — während einer Suche alle offen,
  // damit die Treffer nicht in zugeklappten Jahren verschwinden.
  const [expandedOverrides, setExpandedOverrides] = useState<
    Record<string, boolean>
  >({});
  const searching = search.trim() !== '';
  const changeSearch = useCallback((value: string) => {
    setSearch(value);
    setExpandedOverrides({});
  }, []);
  const yearGroups = useMemo(
    () => groupFirecallsByYear(filterFirecalls(einsaetze, search)),
    [einsaetze, search]
  );

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mb: 2,
          }}
        >
          <Typography variant="h4">{t('einsaetze.title')}</Typography>
          <TextField
            size="small"
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder={t('einsaetze.searchPlaceholder')}
            sx={{ width: { xs: '100%', sm: 320 } }}
            slotProps={{
              htmlInput: { 'aria-label': t('einsaetze.search') },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searching ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label={t('einsaetze.clearSearch')}
                      onClick={() => changeSearch('')}
                    >
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
        </Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <FirecallImport />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth variant="standard">
              <InputLabel id="firecall-group-label-choose">
                {t('einsaetze.groupFilter')}
              </InputLabel>
              <Select
                labelId="firecall-group-label-choose"
                id="firecall-item-type-choose"
                value={groupFilter}
                label={t('einsaetze.groupFilter')}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <MenuItem value={'all'}>{t('einsaetze.allGroups')}</MenuItem>
                {myGroups.map((group) => (
                  <MenuItem key={`group-${group.id}`} value={group.id}>
                    {group.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <OfflineListHint
              fromCache={fromCache}
              empty={einsaetze.length === 0}
            />
          </Grid>
        </Grid>
        {searching && yearGroups.length === 0 && einsaetze.length > 0 && (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            {t('einsaetze.noSearchResults', { query: search.trim() })}
          </Typography>
        )}
        {yearGroups.map((group, index) => {
          const key = yearKey(group);
          const expanded = expandedOverrides[key] ?? (searching || index === 0);
          return (
            <Accordion
              key={key}
              expanded={expanded}
              onChange={(_, isExpanded) =>
                setExpandedOverrides((prev) => ({ ...prev, [key]: isExpanded }))
              }
              slotProps={{ transition: { unmountOnExit: true } }}
              sx={{ mt: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6" component="span" sx={{ mr: 2 }}>
                  {group.year ?? t('einsaetze.withoutDate')}
                </Typography>
                <Typography
                  component="span"
                  color="text.secondary"
                  sx={{ alignSelf: 'center' }}
                >
                  {t('einsaetze.yearCount', { count: group.firecalls.length })}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {group.firecalls.map((einsatz) => (
                    <EinsatzCard
                      einsatz={einsatz}
                      key={einsatz.id}
                      firecallId={firecallId}
                    />
                  ))}
                </Grid>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        onClick={() => setEinsatzDialog(true)}
      >
        <AddIcon />
      </Fab>
      {einsatzDialog && (
        <EinsatzDialog onClose={() => setEinsatzDialog(false)} />
      )}
    </>
  );
}
