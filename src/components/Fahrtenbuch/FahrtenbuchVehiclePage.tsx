'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BarChartIcon from '@mui/icons-material/BarChart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { fahrtenbuchListFilterRange } from '../../common/fahrtenbuchListFilter';
import { browserTimeZone } from '../../common/fahrtenbuchStats';
import useFahrtenbuchEntries from '../../hooks/useFahrtenbuchEntries';
import useFahrtenbuchFirecalls from '../../hooks/useFahrtenbuchFirecalls';
import useFahrtenbuchMangel from '../../hooks/useFahrtenbuchMangel';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFahrtenbuchVehicles from '../../hooks/useFahrtenbuchVehicles';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import FahrtenbuchDialog from './FahrtenbuchDialog';
import FahrtenbuchList from './FahrtenbuchList';
import useEntryDeletion from './useEntryDeletion';
import useFahrtenbuchListFilter from './useFahrtenbuchListFilter';

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
  const tMaengel = useTranslations('fahrtenbuch.maengel');
  const { isAuthorized } = useFirebaseLogin();
  const [pageSize, setPageSize] = useState(PAGE_STEP);
  const { vehicles, vehiclesById, activeVehicles } =
    useFahrtenbuchVehicles(groupId);
  const { activePersons } = useFahrtenbuchPersons(groupId);
  const { filter, setFilter } = useFahrtenbuchListFilter();
  const timeZone = useMemo(() => browserTimeZone(), []);
  const { fromIso, toIso } = useMemo(
    () => fahrtenbuchListFilterRange(filter, timeZone),
    [filter, timeZone],
  );
  /**
   * Zwei Abfragen mit Absicht: Der Zeitraumfilter darf nur die Liste
   * verschieben. `entries` bleibt das Fenster der jüngsten Fahrten und ist die
   * Vorlage des Dialogs — mit einem Zeitraum aus dem Frühjahr schlüge er sonst
   * dessen Zählerstände als Startwerte einer neuen Fahrt vor.
   *
   * Ohne gesetzten Zeitraum sind beide Abfragen deckungsgleich; Firestore
   * führt gleiche Abfragen auf demselben Kanal zusammen.
   */
  const entries = useFahrtenbuchEntries(groupId, { vehicleId, pageSize });
  const listEntries = useFahrtenbuchEntries(groupId, {
    vehicleId,
    pageSize,
    fromIso,
    toIso,
  });
  const { openMangel: openMangelList } = useFahrtenbuchMangel(groupId, {
    vehicleId,
  });
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

  // Der serverseitig gepflegte Zähler gewinnt; die geladenen Mängel sind der
  // Rückfall für Fahrzeuge, an denen das Feld noch nie geschrieben wurde.
  const openMangel = vehicle?.openMangelCount ?? openMangelList.length;

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('loginRequired')}</Typography>
      </Container>
    );
  }

  // Volle Fensterbreite — wie die Übersicht, wegen der breiten Fahrtenliste.
  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        {/* Die Ansicht ist ein teilbarer Link und wird auch direkt geöffnet —
            ohne diesen Button gibt es von hier keinen Weg zur Übersicht. */}
        <Tooltip title={t('backToOverview')}>
          <IconButton
            component={Link}
            href="/fahrtenbuch"
            aria-label={t('backToOverview')}
          >
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {vehicle?.name ?? t('title')}
        </Typography>
        {/* Die Auswertung startet mit diesem Fahrzeug als Filter — von hier
            aus ist die Frage immer „wie viel fährt dieses Fahrzeug". */}
        <Button
          variant="outlined"
          startIcon={<BarChartIcon />}
          component={Link}
          href={`/fahrtenbuch/statistik?vehicle=${vehicleId}`}
        >
          {t('stats.button')}
        </Button>
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
        {/* Derselbe sicherheitsrelevante Hinweis wie auf der Fahrzeugkarte,
            mit demselben Vorrang: der Mängelzähler, sonst der Defekt-Hinweis
            der letzten Fahrt. */}
        {openMangel > 0 ? (
          <Chip
            size="small"
            color="error"
            clickable
            component={Link}
            href={`/fahrtenbuch/maengel?vehicle=${vehicleId}`}
            icon={<WarningAmberIcon />}
            label={tMaengel('openCount', { count: openMangel })}
          />
        ) : (
          vehicle?.lastEntryHasDefect && (
            <Chip
              size="small"
              color="warning"
              icon={<WarningAmberIcon />}
              label={t('defectReported')}
            />
          )
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
        entries={listEntries}
        vehicles={vehicles}
        hideVehicleFilter
        filter={filter}
        onFilterChange={setFilter}
        onEdit={(entry) => {
          setEditEntry(entry);
          setDialogOpen(true);
        }}
        onDelete={requestDelete}
      />

      {listEntries.length >= pageSize && (
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
