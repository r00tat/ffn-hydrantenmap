'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { HierarchyGroup } from '../../common/groupHierarchy';
import type { PlanObjekt } from '../../common/objektplan/objektArt';
import { parseDriveLink } from '../../common/objektplan/driveSync';
import {
  canManageRisikoObjekt,
  objektGroups,
  RISIKOOBJEKT_MANAGE,
} from '../../common/objektplan/risikoobjektAccess';
import { filterRisikoObjekte } from '../../common/objektplan/risikoobjektFilter';
import ObjektplanDialog from '../../components/Objektplan/ObjektplanDialog';
import RisikoObjektEditDialog from '../../components/Objektplan/RisikoObjektEditDialog';
import UnsharedRisikoObjekteBanner from '../../components/Objektplan/UnsharedRisikoObjekteBanner';
import { usePlanObjekte } from '../../components/Objektplan/usePlanObjekte';
import OfflineListHint from '../../components/site/OfflineListHint';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useCanAny } from '../../hooks/usePermissions';
import { getGroupsAction } from '../groups/GroupAction';

/**
 * Alle Risikoobjekte und gefährdeten Objekte als eine Liste, mit dem Weg zu
 * ihren Plänen — für die Vorbereitung und für Objekte, die man auf der Karte
 * erst suchen müsste (`usePlanObjekte`).
 *
 * Wer `risikoobjekte.manage` in einer Gruppe hat, legt hier Risikoobjekte an
 * und pflegt die Objekte, die seiner Gruppe freigegeben sind
 * (docs/objektplaene.md, „Freigabe an Gruppen").
 */
export default function RisikoobjektePage() {
  const t = useTranslations('risikoobjekte');
  const { isAdmin, groupRoles, myGroups } = useFirebaseLogin();
  const canCreate = useCanAny(RISIKOOBJEKT_MANAGE);
  const { records, loading, fromCache } = usePlanObjekte({ includeMetadataChanges: true });
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<PlanObjekt | null>(null);
  const [editing, setEditing] = useState<PlanObjekt | 'new' | null>(null);
  const [allGroups, setAllGroups] = useState<Record<string, string>>({});
  const [groupHierarchy, setGroupHierarchy] = useState<HierarchyGroup[]>([]);

  // Namen fremder Gruppen kommen vom Server; offline bleiben die eigenen.
  useEffect(() => {
    let active = true;
    getGroupsAction()
      .then((groups) => {
        if (!active) return;
        setGroupHierarchy(groups);
        setAllGroups(
          Object.fromEntries(groups.filter((g) => g.id).map((g) => [g.id as string, g.name])),
        );
      })
      .catch((err) => console.warn('Gruppen nicht geladen', err));
    return () => {
      active = false;
    };
  }, []);

  const groupNames = useMemo(
    () => ({
      ...Object.fromEntries(
        (myGroups ?? []).filter((g) => g.id).map((g) => [g.id as string, g.name]),
      ),
      ...allGroups,
    }),
    [myGroups, allGroups],
  );

  const user = useMemo(() => ({ isAdmin, groupRoles }), [isAdmin, groupRoles]);
  const shown = useMemo(() => filterRisikoObjekte(records, term), [records, term]);
  const unsharedCount = useMemo(
    () => records.filter((o) => objektGroups(o).length === 0).length,
    [records],
  );

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h4" component="h1" sx={{ flex: 1 }}>
          {t('title')}
        </Typography>
        {canCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
            {t('new')}
          </Button>
        )}
      </Box>

      {isAdmin && unsharedCount > 0 && (
        <UnsharedRisikoObjekteBanner count={unsharedCount} groupNames={groupNames} />
      )}

      <TextField
        fullWidth
        label={t('searchLabel')}
        helperText={t('searchHelper')}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
      />

      <OfflineListHint fromCache={fromCache} empty={records.length === 0} />

      {loading && records.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {t('count', { count: shown.length })}
          </Typography>
          <List>
            {shown.map((o) => {
              const groups = objektGroups(o);
              return (
                <ListItem
                  key={`${o.art}/${o.id}`}
                  divider
                  disablePadding
                  secondaryAction={
                    canManageRisikoObjekt(user, o) ? (
                      <Tooltip title={t('edit')}>
                        <IconButton edge="end" aria-label={t('edit')} onClick={() => setEditing(o)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    ) : undefined
                  }
                >
                  <ListItemButton onClick={() => setSelected(o)}>
                    <ListItemText
                      primary={o.name}
                      secondary={
                        <>
                          {[o.ortschaft, o.adresse, o.risikogruppe].filter(Boolean).join(' · ')}
                          <Box component="span" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {o.art === 'gefahrobjekt' && (
                              <Chip size="small" color="info" label={t('art.gefahrobjekt')} component="span" />
                            )}
                            {groups.length === 0 ? (
                              <Chip size="small" color="warning" variant="outlined" label={t('notShared')} component="span" />
                            ) : (
                              groups.map((g) => (
                                <Chip key={g} size="small" label={groupNames[g] ?? g} component="span" />
                              ))
                            )}
                          </Box>
                        </>
                      }
                      slotProps={{ secondary: { component: 'div' } }}
                    />
                    {o.einsatzplanummer !== undefined && o.einsatzplanummer !== '' && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={t('planNumber', { nummer: String(o.einsatzplanummer) })}
                        sx={{ ml: 1 }}
                      />
                    )}
                    {parseDriveLink(o.link) && (
                      <Tooltip title={t('driveLinked')}>
                        <FolderSharedIcon color="action" fontSize="small" sx={{ ml: 1 }} />
                      </Tooltip>
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </>
      )}

      {selected && (
        <ObjektplanDialog open onClose={() => setSelected(null)} objekt={selected} />
      )}
      {editing && (
        <RisikoObjektEditDialog
          open
          onClose={() => setEditing(null)}
          objekt={editing === 'new' ? undefined : editing}
          groupNames={groupNames}
          groupHierarchy={groupHierarchy}
        />
      )}
    </Container>
  );
}
