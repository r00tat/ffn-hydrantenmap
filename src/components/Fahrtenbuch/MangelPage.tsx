'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  MANGEL_STATUSES,
  isOpenMangel,
  type Mangel,
  type MangelStatus,
} from '../../common/mangel';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFahrtenbuchMangel from '../../hooks/useFahrtenbuchMangel';
import useFahrtenbuchVehicles from '../../hooks/useFahrtenbuchVehicles';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import MangelDialog from './MangelDialog';
import MangelList from './MangelList';
import { deleteMangel } from './mangelActions';

/**
 * Der Statusfilter. `'openAll'` ist kein einzelner Status, sondern die
 * Arbeitsliste (offen *und* in Arbeit) — genau die Sicht, mit der man die
 * Seite öffnet.
 *
 * Der Sammelfilter braucht dafür einen eigenen Wert: Hieße er `'open'`, gäbe es
 * ihn zweimal in der Liste — einmal als Sammelfilter und einmal als Status
 * `'open'`. MUI vergleicht die Auswahl über den Wert, markierte beide Einträge
 * und zeigte im geschlossenen Feld den zuletzt gerenderten Treffer; der Filter
 * „nur Status offen" war damit gar nicht erreichbar (#707).
 */
export type StatusFilter = 'openAll' | MangelStatus | 'all';

/**
 * Die Optionen in Anzeigereihenfolge. Ihre Werte müssen paarweise verschieden
 * sein — ein Test in `MangelPage.test.tsx` wacht darüber.
 */
export const MANGEL_STATUS_FILTERS: StatusFilter[] = [
  'openAll',
  ...MANGEL_STATUSES,
  'all',
];

/**
 * Der Übersetzungsschlüssel einer Option. Die beiden Sammeleinträge stehen
 * unter `filters.*`, die echten Status teilen sich die Beschriftungen mit Liste
 * und Dialog.
 */
function statusFilterLabelKey(filter: StatusFilter) {
  if (filter === 'openAll') return 'filters.openAll';
  if (filter === 'all') return 'filters.all';
  return `statuses.${filter}`;
}

/**
 * Alle Mängel der Gruppe — die Arbeitsliste des Fahrzeugverantwortlichen.
 *
 * Standardmäßig fahrzeugübergreifend; der Fahrzeugfilter lässt sich über den
 * Query-Parameter `?vehicle=<id>` vorbelegen. Das ist der Weg vom Chip auf der
 * Fahrzeugkarte, ohne dass die Seite dadurch auf ein Fahrzeug festgelegt wäre.
 */
export default function MangelPage() {
  const t = useTranslations('fahrtenbuch.maengel');
  const tFahrtenbuch = useTranslations('fahrtenbuch');
  const { isAuthorized, isAdmin } = useFirebaseLogin();
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const { vehicles, activeVehicles } = useFahrtenbuchVehicles(groupId);
  const { mangel } = useFahrtenbuchMangel(groupId);
  const searchParams = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('openAll');
  // Nur die Vorbelegung kommt aus der URL; danach führt der Benutzer den
  // Filter. Ein an die URL gebundener Filter zwänge sonst zu einer Navigation
  // für jede Änderung.
  const [vehicleFilter, setVehicleFilter] = useState(
    () => searchParams.get('vehicle') ?? '',
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMangel, setEditMangel] = useState<Mangel>();
  const [deleteError, setDeleteError] = useState<string>();

  const filtered = useMemo(
    () =>
      mangel.filter((item) => {
        if (vehicleFilter && item.vehicleId !== vehicleFilter) return false;
        if (statusFilter === 'all') return true;
        if (statusFilter === 'openAll') return isOpenMangel(item);
        return item.status === statusFilter;
      }),
    [mangel, statusFilter, vehicleFilter],
  );

  const requestDelete = async (item: Mangel) => {
    if (!groupId || !item.id) return;
    if (!window.confirm(t('deleteConfirm'))) return;
    setDeleteError(undefined);
    const result = await deleteMangel(groupId, item.id);
    if (!result.success) {
      setDeleteError(result.error);
    }
  };

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{tFahrtenbuch('loginRequired')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap' }}
      >
        {/* Die Seite ist ein teilbarer Link und wird auch direkt geöffnet —
            ohne diesen Button gibt es von hier keinen Weg zum Fahrtenbuch. */}
        <Tooltip title={tFahrtenbuch('backToOverview')}>
          <IconButton
            component={Link}
            href="/fahrtenbuch"
            aria-label={tFahrtenbuch('backToOverview')}
          >
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('title')}
        </Typography>
        {groups.length > 1 && (
          <TextField
            select
            size="small"
            label={tFahrtenbuch('group')}
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
        <Button
          variant="contained"
          disabled={!groupId || activeVehicles.length === 0}
          onClick={() => {
            setEditMangel(undefined);
            setDialogOpen(true);
          }}
        >
          {t('newMangel')}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('subtitle')}
      </Typography>

      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <TextField
          select
          size="small"
          label={t('filters.status')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          sx={{ minWidth: 200 }}
        >
          {MANGEL_STATUS_FILTERS.map((f) => (
            <MenuItem key={f} value={f}>
              {t(statusFilterLabelKey(f) as 'statuses.open')}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t('filters.vehicle')}
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{t('filters.all')}</MenuItem>
          {/* Auch stillgelegte Fahrzeuge: Ein offener Mangel an einem
              stillgelegten Fahrzeug darf nicht unauffindbar werden. */}
          {vehicles.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {deleteError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('errors.deleteFailed', { message: deleteError })}
        </Alert>
      )}

      <MangelList
        mangel={filtered}
        hideVehicle={!!vehicleFilter}
        onEdit={(item) => {
          setEditMangel(item);
          setDialogOpen(true);
        }}
        onDelete={isAdmin ? requestDelete : undefined}
      />

      {/* Bedingtes Mounten (plus key): der Dialog liest seinen Anfangszustand
          nur beim Mounten — sonst zeigt er beim zweiten Öffnen alte Werte. */}
      {dialogOpen && groupId && (
        <MangelDialog
          key={editMangel?.id ?? 'new'}
          open
          groupId={groupId}
          vehicles={activeVehicles}
          vehicleId={vehicleFilter || undefined}
          mangel={editMangel}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </Container>
  );
}
