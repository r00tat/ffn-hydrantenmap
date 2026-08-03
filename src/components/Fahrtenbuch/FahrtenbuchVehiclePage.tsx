'use client';

import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import useFahrtenbuchEntries from '../../hooks/useFahrtenbuchEntries';
import useFahrtenbuchFirecalls from '../../hooks/useFahrtenbuchFirecalls';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFahrtenbuchVehicles from '../../hooks/useFahrtenbuchVehicles';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import FahrtenbuchDialog from './FahrtenbuchDialog';
import FahrtenbuchList from './FahrtenbuchList';
import useEntryDeletion from './useEntryDeletion';

export interface FahrtenbuchVehiclePageProps {
  groupId: string;
  vehicleId: string;
}

const PAGE_STEP = 50;

/**
 * Ansicht eines einzelnen Fahrzeugs — teilbarer Link. Oben Stammdaten und
 * aktuelle Zählerstände, darunter die Fahrten dieses Fahrzeugs.
 */
export default function FahrtenbuchVehiclePage({
  groupId,
  vehicleId,
}: FahrtenbuchVehiclePageProps) {
  const t = useTranslations('fahrtenbuch');
  const { isAuthorized } = useFirebaseLogin();
  const [pageSize, setPageSize] = useState(PAGE_STEP);
  const { vehicles, vehiclesById, activeVehicles } =
    useFahrtenbuchVehicles(groupId);
  const { activePersons } = useFahrtenbuchPersons(groupId);
  const entries = useFahrtenbuchEntries(groupId, { vehicleId, pageSize });
  const firecalls = useFahrtenbuchFirecalls(groupId);
  const { deleteError, clearDeleteError, requestDelete } =
    useEntryDeletion(groupId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<FahrtenbuchEntry>();

  const vehicle = vehiclesById.get(vehicleId);

  /**
   * Auswahl im Dialog: das Fahrzeug dieser Seite ist immer dabei, auch wenn es
   * stillgelegt ist — sonst stünde die Auswahl leer.
   */
  const dialogVehicles = useMemo(() => {
    if (!vehicle || activeVehicles.some((v) => v.id === vehicleId)) {
      return activeVehicles;
    }
    return [...activeVehicles, vehicle];
  }, [activeVehicles, vehicle, vehicleId]);

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('loginRequired')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {vehicle?.name ?? t('title')}
        </Typography>
        <Button
          variant="contained"
          disabled={!vehicle}
          onClick={() => {
            setEditEntry(undefined);
            setDialogOpen(true);
          }}
        >
          {t('newEntry')}
        </Button>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {vehicle?.kennzeichen && (
          <Chip size="small" label={vehicle.kennzeichen} />
        )}
        {/* Derselbe sicherheitsrelevante Hinweis wie auf der Fahrzeugkarte —
            aus dem serverseitig gepflegten Cache, nicht aus den Einträgen. */}
        {vehicle?.lastEntryHasDefect && (
          <Chip
            size="small"
            color="warning"
            icon={<WarningAmberIcon />}
            label={t('defectReported')}
          />
        )}
        {/* Zähler kommen ausschließlich aus den Definitionen des Fahrzeugs —
            ein Anhänger ohne Zähler zeigt hier schlicht nichts. */}
        {(vehicle?.counters ?? []).map((def) => {
          const value = vehicle?.lastCounters?.[def.id];
          if (value === undefined) return null;
          const label = def.labelKey
            ? t(def.labelKey as 'counters.km')
            : def.label;
          return (
            <Chip
              key={def.id}
              size="small"
              label={`${label}: ${value} ${def.unit}`}
            />
          );
        })}
      </Stack>

      {deleteError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {deleteError}
        </Alert>
      )}

      <FahrtenbuchList
        entries={entries}
        vehicles={vehicles}
        hideVehicleFilter
        onEdit={(entry) => {
          setEditEntry(entry);
          setDialogOpen(true);
        }}
        onDelete={requestDelete}
      />

      {entries.length >= pageSize && (
        <Button
          sx={{ mt: 2 }}
          onClick={() => setPageSize((size) => size + PAGE_STEP)}
        >
          {t('loadMore')}
        </Button>
      )}

      {/* Bedingtes Mounten (plus key): der Dialog liest seinen Anfangszustand
          nur beim Mounten — sonst zeigt er beim zweiten Öffnen alte Werte. */}
      {dialogOpen && (
        <FahrtenbuchDialog
          key={`${editEntry?.id ?? 'new'}-${vehicleId}`}
          open
          groupId={groupId}
          vehicles={dialogVehicles}
          persons={activePersons}
          firecalls={firecalls}
          entries={entries}
          vehicleId={vehicleId}
          entry={editEntry}
          onClose={() => {
            setDialogOpen(false);
            // Eine alte Löschmeldung soll eine erfolgreiche Erfassung nicht
            // überdauern.
            clearDeleteError();
          }}
        />
      )}
    </Container>
  );
}
