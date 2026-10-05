'use client';

import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import {
  formatLagerort,
  isBelowMinimum,
  isContainer,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';
import useFahrtenbuchGroup from '../../../hooks/useFahrtenbuchGroup';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import useGeraete from '../../../hooks/useGeraete';
import { isFahrtenbuchManager } from '../../Fahrtenbuch/managerPermissions';
import OfflineListHint from '../../site/OfflineListHint';
import OnlineOnly from '../../site/OnlineOnly';
import { setGeraeteVerbrauchsmaterial } from '../geraeteActions';
import { callAction } from './actionResult';
import GeraetDetailDialog from './GeraetDetailDialog';
import GeraetEditDialog from './GeraetEditDialog';
import GeraeteImportDialog from './GeraeteImportDialog';
import {
  DEFAULT_GERAETE_FILTER,
  filterGeraete,
  klasse1Options,
  lagerortOptions,
  reorderList,
  type GeraeteFilter,
} from './geraeteFilter';

/** Seitengröße der Artikelliste — der Geräte-Export allein hat über 700 Artikel. */
const PAGE_SIZE = 100;

type View = 'list' | 'reorder';

/** Die Lagerorte eines Artikels als kurze Zeile: zwei Orte, dann „+N". */
function lagerortSummary(bestaende: GeraetBestand[] | undefined): string {
  if (!bestaende || bestaende.length === 0) return '';
  const labels = bestaende.map((b) => formatLagerort(b.lagerort)).filter(Boolean);
  const shown = labels.slice(0, 2).join(', ');
  return labels.length > 2 ? `${shown} +${labels.length - 2}` : shown;
}

/**
 * Lagerseite „Geräte & Material" einer Gruppe.
 *
 * Lesen dürfen alle Gruppenmitglieder (wo liegt was, was ist nachzubestellen);
 * Pflege, Buchungen und Import nur Gruppen-Admin und Gerätemeister — dieselbe
 * Rolle wie im Fahrtenbuch. Die Knöpfe sind Bedienkomfort, die Grenze ziehen
 * die Server Actions mit `actionFahrtenbuchManagerRequired`.
 */
export default function GeraeteAdminPage() {
  const t = useTranslations('geraete');
  const format = useFormatter();
  const { isAuthorized, isAdmin, groups: userGroups, groupAdmin, fahrtenbuchGeraetemeister } =
    useFirebaseLogin();
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const { geraete, bestaende, bestaendeByGeraet, loading, fromCache } = useGeraete(groupId);
  const containers = useMemo(() => geraete.filter(isContainer), [geraete]);

  const canManage =
    !!groupId &&
    isFahrtenbuchManager(groupId, {
      isAdmin,
      groups: userGroups,
      groupAdmin,
      fahrtenbuchGeraetemeister,
    });

  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<GeraeteFilter>(DEFAULT_GERAETE_FILTER);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [detailId, setDetailId] = useState<string>();
  const [edit, setEdit] = useState<{ geraet?: Geraet }>();
  const [importOpen, setImportOpen] = useState(false);
  /**
   * Auswahlmodus der Liste: `undefined` aus, sonst die gewählten IDs. Damit
   * werden die Verbrauchsartikel nach einem Import markiert — der Export sagt
   * nicht, welche es sind.
   */
  const [selection, setSelection] = useState<Set<string>>();
  const [marking, setMarking] = useState(false);
  const [markResult, setMarkResult] = useState<{ ok: boolean; text: string }>();
  const idPrefix = useId();

  const klassen = useMemo(() => klasse1Options(geraete), [geraete]);
  const lagerorte = useMemo(() => lagerortOptions(bestaende), [bestaende]);
  const filtered = useMemo(
    () => filterGeraete(geraete, bestaendeByGeraet, filter),
    [geraete, bestaendeByGeraet, filter],
  );
  const reorder = useMemo(() => reorderList(geraete), [geraete]);

  const detail = detailId ? geraete.find((g) => g.id === detailId) : undefined;

  const toggleSelected = (id: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markSelected = async (verbrauchsmaterial: boolean) => {
    if (!groupId || !selection || selection.size === 0) return;
    setMarkResult(undefined);
    setMarking(true);
    const outcome = await callAction(() =>
      setGeraeteVerbrauchsmaterial(groupId, [...selection], verbrauchsmaterial),
    );
    setMarking(false);
    if (!outcome.ok) {
      setMarkResult({ ok: false, text: t('errors.saveFailed', { error: outcome.error }) });
      return;
    }
    setMarkResult({ ok: true, text: t('list.marked', { count: outcome.value.updated }) });
    setSelection(new Set());
  };

  const updateFilter = (patch: Partial<GeraeteFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE_SIZE);
  };

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('loginRequired')}</Typography>
      </Container>
    );
  }

  const toggleChip = (
    key: 'onlyConsumable' | 'onlyBelowMinimum' | 'showInactive',
    label: string,
  ) => (
    <Chip
      label={label}
      color={filter[key] ? 'primary' : 'default'}
      variant={filter[key] ? 'filled' : 'outlined'}
      onClick={() => updateFilter({ [key]: !filter[key] })}
      aria-pressed={filter[key]}
    />
  );

  const renderItem = (g: Geraet) => {
    const below = isBelowMinimum(g);
    const secondary = [g.inventarNr, g.klasse1, lagerortSummary(bestaendeByGeraet.get(g.id))]
      .filter(Boolean)
      .join(' · ');
    const labelId = `${idPrefix}-${g.id}`;
    return (
      <ListItemButton
        key={g.id}
        divider
        onClick={() => (selection ? toggleSelected(g.id) : setDetailId(g.id))}
      >
        {selection && (
          <ListItemIcon sx={{ minWidth: 40 }}>
            <Checkbox
              edge="start"
              checked={selection.has(g.id)}
              tabIndex={-1}
              disableRipple
              slotProps={{ input: { 'aria-labelledby': labelId } }}
            />
          </ListItemIcon>
        )}
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span id={labelId}>{g.bezeichnung}</span>
              {g.verbrauchsmaterial && (
                <Chip size="small" variant="outlined" label={t('list.consumable')} />
              )}
              {!g.active && <Chip size="small" label={t('list.inactive')} />}
              {below && <Chip size="small" color="warning" label={t('list.belowMinimum')} />}
            </Stack>
          }
          secondary={secondary || undefined}
          slotProps={{ primary: { component: 'div' } }}
        />
        <Typography
          variant="body2"
          sx={{ ml: 2, whiteSpace: 'nowrap', color: below ? 'warning.main' : undefined }}
        >
          {t('list.stock', { anzahl: g.bestandGesamt ?? 0, einheit: g.einheit ?? '' })}
          {g.mindestbestand != null && ` / ${g.mindestbestand}`}
        </Typography>
      </ListItemButton>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('title')}
        </Typography>
        {groups.length > 1 && (
          <TextField
            select
            size="small"
            label={t('group')}
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {canManage && (
          <>
            <OnlineOnly>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => setImportOpen(true)}
              >
                {t('import.open')}
              </Button>
            </OnlineOnly>
            <OnlineOnly>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setEdit({})}
              >
                {t('newGeraet')}
              </Button>
            </OnlineOnly>
          </>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('subtitle')}
      </Typography>

      {groups.length === 0 && (
        <Typography color="text.secondary">{t('noGroup')}</Typography>
      )}

      <Tabs
        value={view}
        onChange={(_, value: View) => setView(value)}
        variant="scrollable"
        sx={{ mb: 2 }}
      >
        <Tab value="list" label={t('tabs.list', { count: filtered.length })} />
        <Tab value="reorder" label={t('tabs.reorder', { count: reorder.length })} />
      </Tabs>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      <OfflineListHint fromCache={fromCache} empty={geraete.length === 0} />

      {view === 'list' && (
        <>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            useFlexGap
            sx={{ mb: 2 }}
          >
            <TextField
              size="small"
              type="search"
              label={t('filters.search')}
              value={filter.search}
              onChange={(e) => updateFilter({ search: e.target.value })}
              sx={{ flexGrow: 1, minWidth: 200 }}
            />
            <TextField
              select
              size="small"
              label={t('filters.klasse1')}
              value={filter.klasse1}
              onChange={(e) => updateFilter({ klasse1: e.target.value })}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">{t('filters.all')}</MenuItem>
              {klassen.map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete
              size="small"
              options={lagerorte}
              value={lagerorte.find((l) => l.key === filter.lagerortKey) ?? null}
              onChange={(_, value) => updateFilter({ lagerortKey: value?.key ?? '' })}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.key === b.key}
              renderInput={(params) => (
                <TextField {...params} label={t('filters.lagerort')} />
              )}
              sx={{ minWidth: 240 }}
            />
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
          >
            {toggleChip('onlyConsumable', t('filters.onlyConsumable'))}
            {toggleChip('onlyBelowMinimum', t('filters.onlyBelowMinimum'))}
            {toggleChip('showInactive', t('filters.showInactive'))}
            {canManage && !selection && (
              <OnlineOnly>
                <Button
                  size="small"
                  sx={{ ml: 'auto' }}
                  onClick={() => {
                    setMarkResult(undefined);
                    setSelection(new Set());
                  }}
                >
                  {t('list.select')}
                </Button>
              </OnlineOnly>
            )}
          </Stack>

          {selection && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('list.selectHint')}
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ flexWrap: 'wrap', alignItems: 'center' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 'bold', mr: 1 }}>
                  {t('list.selected', { count: selection.size })}
                </Typography>
                <Button
                  size="small"
                  onClick={() =>
                    setSelection((prev) => new Set([...(prev ?? []), ...filtered.map((g) => g.id)]))
                  }
                >
                  {t('list.selectAll', { count: filtered.length })}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={marking || selection.size === 0}
                  onClick={() => markSelected(true)}
                >
                  {t('list.markConsumable')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={marking || selection.size === 0}
                  onClick={() => markSelected(false)}
                >
                  {t('list.markDevice')}
                </Button>
                <Button size="small" sx={{ ml: 'auto' }} onClick={() => setSelection(undefined)}>
                  {t('list.selectDone')}
                </Button>
              </Stack>
            </Box>
          )}
          {markResult && (
            <Alert
              severity={markResult.ok ? 'success' : 'error'}
              sx={{ mb: 2 }}
              onClose={() => setMarkResult(undefined)}
            >
              {markResult.text}
            </Alert>
          )}

          {!loading && filtered.length === 0 ? (
            <Typography color="text.secondary">{t('list.empty')}</Typography>
          ) : (
            <List disablePadding>{filtered.slice(0, limit).map(renderItem)}</List>
          )}
          {filtered.length > limit && (
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                {t('list.showMore', { count: filtered.length - limit })}
              </Button>
            </Box>
          )}
        </>
      )}

      {view === 'reorder' && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('reorder.hint')}
          </Typography>
          {reorder.length === 0 ? (
            <Typography color="text.secondary">{t('reorder.empty')}</Typography>
          ) : (
            <List disablePadding>
              {reorder.map((g) => (
                <ListItemButton key={g.id} divider onClick={() => setDetailId(g.id)}>
                  <ListItemText
                    primary={g.bezeichnung}
                    secondary={[
                      t('reorder.line', {
                        anzahl: g.bestandGesamt ?? 0,
                        mindestbestand: g.mindestbestand ?? 0,
                        einheit: g.einheit ?? '',
                      }),
                      g.nachbestellenSeit
                        ? t('reorder.since', {
                            date: format.dateTime(new Date(g.nachbestellenSeit), {
                              dateStyle: 'medium',
                            }),
                          })
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </>
      )}

      {detail && groupId && (
        <GeraetDetailDialog
          open
          groupId={groupId}
          geraet={detail}
          bestaende={bestaendeByGeraet.get(detail.id) ?? []}
          allBestaende={bestaende}
          containers={containers}
          canManage={canManage}
          onClose={() => setDetailId(undefined)}
          onEdit={() => setEdit({ geraet: detail })}
        />
      )}
      {edit && groupId && (
        <GeraetEditDialog
          open
          groupId={groupId}
          geraet={edit.geraet}
          onClose={() => setEdit(undefined)}
          onDone={(result) => {
            // Ein gelöschter Artikel verschwindet aus der Liste; ein offener
            // Detaildialog zeigte sonst einen Artikel, den es nicht mehr gibt.
            if (result === 'deleted') setDetailId(undefined);
          }}
        />
      )}
      {importOpen && groupId && (
        <GeraeteImportDialog
          open
          groupId={groupId}
          geraete={geraete}
          bestaende={bestaende}
          onClose={() => setImportOpen(false)}
        />
      )}
    </Container>
  );
}
