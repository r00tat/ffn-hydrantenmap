'use client';

import BarChartIcon from '@mui/icons-material/BarChart';
import BuildIcon from '@mui/icons-material/Build';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { fahrtenbuchListFilterRange } from '../../common/fahrtenbuchListFilter';
import { browserTimeZone } from '../../common/fahrtenbuchStats';
import useFahrtenbuchEntries from '../../hooks/useFahrtenbuchEntries';
import useFahrtenbuchFirecalls from '../../hooks/useFahrtenbuchFirecalls';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFahrtenbuchMangel from '../../hooks/useFahrtenbuchMangel';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFahrtenbuchVehicles from '../../hooks/useFahrtenbuchVehicles';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import FahrtenbuchDialog from './FahrtenbuchDialog';
import FahrtenbuchExportDialog from './FahrtenbuchExportDialog';
import FahrtenbuchList from './FahrtenbuchList';
import FahrtenbuchVehicleCard from './FahrtenbuchVehicleCard';
import useEntryDeletion from './useEntryDeletion';
import useFahrtenbuchListFilter from './useFahrtenbuchListFilter';

/** Schrittweite von „Mehr laden" — wie auf der Fahrzeugseite. */
const PAGE_STEP = 50;

/**
 * Ob es zur jüngsten Fahrt eines Fahrzeugs einen Mangeldatensatz gibt.
 *
 * `undefined` heißt „nicht zu beantworten": Liegt die letzte Fahrt außerhalb
 * des geladenen Fensters, kennt die Seite sie nicht — das ist keine Auskunft
 * über Mängel und darf nicht als „keiner" durchgehen.
 */
function lastEntryMangelKnown(
  lastEntryId: string | undefined,
  mangelEntryIds: Set<string>,
): boolean | undefined {
  return lastEntryId ? mangelEntryIds.has(lastEntryId) : undefined;
}

/**
 * Übersicht des Fahrtenbuchs: eine Karte je aktivem Fahrzeug mit Direkt-Button,
 * darunter eingeklappt die gruppenweite Fahrtenliste mit Filtern.
 */
export default function FahrtenbuchPage() {
  const t = useTranslations('fahrtenbuch');
  const tMaengel = useTranslations('fahrtenbuch.maengel');
  const { isAuthorized } = useFirebaseLogin();
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const { vehicles, activeVehicles } = useFahrtenbuchVehicles(groupId);
  const { activePersons } = useFahrtenbuchPersons(groupId);
  const { filter, setFilter } = useFahrtenbuchListFilter();
  const [pageSize, setPageSize] = useState(PAGE_STEP);
  const timeZone = useMemo(() => browserTimeZone(), []);
  const { fromIso, toIso } = useMemo(
    () => fahrtenbuchListFilterRange(filter, timeZone),
    [filter, timeZone],
  );
  /**
   * Zwei Abfragen mit Absicht: Der Zeitraumfilter darf nur die Liste
   * verschieben. `entries` bleibt das Fenster der jüngsten Fahrten — daraus
   * kommen der letzte Fahrer auf den Fahrzeugkarten und die Vorlage des
   * Dialogs, und beide meinen „zuletzt", nicht „zuletzt im gewählten Zeitraum".
   *
   * Ohne gesetzten Zeitraum sind beide Abfragen deckungsgleich; Firestore
   * führt gleiche Abfragen auf demselben Kanal zusammen.
   */
  const entries = useFahrtenbuchEntries(groupId);
  const listEntries = useFahrtenbuchEntries(groupId, {
    pageSize,
    fromIso,
    toIso,
  });
  const firecalls = useFahrtenbuchFirecalls(groupId);
  const { mangel, openCountByVehicle } = useFahrtenbuchMangel(groupId);
  // Der Menüpunkt führt immer hierher; in die Sammelerfassung des laufenden
  // Einsatzes geht es über diesen Button. `unknown` heißt: kein Einsatz aktiv.
  const firecallId = useFirecallId();
  const firecall = useFirecall();
  const hasFirecall = firecallId !== 'unknown';
  const { deleteError, clearDeleteError, requestDelete } =
    useEntryDeletion(groupId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogVehicleId, setDialogVehicleId] = useState<string>();
  const [editEntry, setEditEntry] = useState<FahrtenbuchEntry>();
  const [exportOpen, setExportOpen] = useState(false);

  /** Letzter Eintrag je Fahrzeug — für Fahrer und Defekt-Hinweis auf der Karte. */
  const lastEntryByVehicle = useMemo(() => {
    const map = new Map<string, FahrtenbuchEntry>();
    // entries sind absteigend nach abfahrt sortiert, der erste Treffer je
    // Fahrzeug ist also die jüngste Fahrt.
    for (const entry of entries) {
      if (!map.has(entry.vehicleId)) map.set(entry.vehicleId, entry);
    }
    return map;
  }, [entries]);

  /**
   * Fahrten, zu denen es einen Mangeldatensatz gibt. Entscheidet zusammen mit
   * dem Fahrzeug-Cache, ob „Defekt gemeldet" noch etwas zu sagen hat — siehe
   * `showDefectHint`.
   */
  const mangelEntryIds = useMemo(
    () =>
      new Set(
        mangel
          .map((m) => m.entryId)
          .filter((id): id is string => id !== undefined),
      ),
    [mangel],
  );

  /**
   * Auswahl im Dialog: aktive Fahrzeuge, beim Bearbeiten zusätzlich das
   * Fahrzeug des Eintrags — sonst stünde die Auswahl bei einem inzwischen
   * stillgelegten Fahrzeug leer.
   */
  const dialogVehicles = useMemo(() => {
    const editedVehicle = editEntry
      ? vehicles.find((v) => v.id === editEntry.vehicleId)
      : undefined;
    if (!editedVehicle || activeVehicles.some((v) => v.id === editedVehicle.id)) {
      return activeVehicles;
    }
    return [...activeVehicles, editedVehicle];
  }, [activeVehicles, vehicles, editEntry]);

  const openDialog = (vehicleId?: string, entry?: FahrtenbuchEntry) => {
    setDialogVehicleId(vehicleId);
    setEditEntry(entry);
    setDialogOpen(true);
  };

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('loginRequired')}</Typography>
      </Container>
    );
  }

  // Volle Fensterbreite: Die Fahrtenliste hat viele Spalten, bei „lg" blieb die
  // Fahrstrecke auf einem breiten Monitor unnötig schmal.
  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 3, alignItems: 'center', flexWrap: 'wrap' }}
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
        {hasFirecall && (
          <Button
            variant="outlined"
            component={Link}
            href={`/einsatz/${firecallId}/fahrtenbuch`}
          >
            {t('einsatz.bookForFirecall', { name: firecall.name })}
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<BarChartIcon />}
          component={Link}
          href="/fahrtenbuch/statistik"
        >
          {t('stats.button')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<BuildIcon />}
          component={Link}
          href="/fahrtenbuch/maengel"
        >
          {tMaengel('title')}
        </Button>
        {/* Auch mit ausschließlich stillgelegten Fahrzeugen sinnvoll: deren
            alte Fahrten gehören in einen Nachweis über einen vergangenen
            Zeitraum. */}
        <Button
          variant="outlined"
          startIcon={<PictureAsPdfIcon />}
          disabled={!groupId || vehicles.length === 0}
          onClick={() => setExportOpen(true)}
        >
          {t('export.button')}
        </Button>
        <Button
          variant="contained"
          disabled={!groupId || activeVehicles.length === 0}
          onClick={() => openDialog()}
        >
          {t('newEntry')}
        </Button>
      </Stack>

      {activeVehicles.length === 0 ? (
        <>
          <Typography>{t('noGroups')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('noGroupsHint')}
          </Typography>
        </>
      ) : (
        <Grid container spacing={2}>
          {/* Die Breakpoints bis `xl` gehören zur vollen Fensterbreite: Sonst
              wären es auf einem breiten Monitor drei extrem breite Karten pro
              Zeile. */}
          {activeVehicles.map((vehicle) => (
            <Grid
              size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }}
              key={vehicle.id}
            >
              <FahrtenbuchVehicleCard
                groupId={groupId as string}
                vehicle={vehicle}
                lastEntryHasDefect={
                  lastEntryByVehicle.get(vehicle.id as string)?.defekt
                }
                lastDriverName={
                  lastEntryByVehicle.get(vehicle.id as string)?.driverName
                }
                openMangelCount={openCountByVehicle.get(vehicle.id as string)}
                lastEntryHasMangel={lastEntryMangelKnown(
                  lastEntryByVehicle.get(vehicle.id as string)?.id,
                  mangelEntryIds,
                )}
                onAddTrip={(vehicleId) => openDialog(vehicleId)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      <Accordion sx={{ mt: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>{t('allVehicles')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* Die Meldung steht bei den Löschbuttons, nicht oben auf der Seite:
              bei vielen Fahrzeugen wäre sie dort außerhalb des Sichtbereichs
              und die abgelehnte Löschung sähe wie ein toter Button aus. */}
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <FahrtenbuchList
            entries={listEntries}
            vehicles={vehicles}
            filter={filter}
            onFilterChange={setFilter}
            onEdit={(entry) => openDialog(entry.vehicleId, entry)}
            onDelete={requestDelete}
          />

          {/* Ohne „Mehr laden" endete ein gewählter Zeitraum stillschweigend
              nach 50 Fahrten — die Liste sähe vollständig aus, wäre es aber
              nicht. */}
          {listEntries.length >= pageSize && (
            <Button
              sx={{ mt: 2 }}
              onClick={() => setPageSize((size) => size + PAGE_STEP)}
            >
              {t('loadMore')}
            </Button>
          )}
        </AccordionDetails>
      </Accordion>

      {/* Ebenfalls bedingt gemountet: Zeitraum und Fahrzeugauswahl sind beim
          Öffnen neu zu setzen, nicht die des letzten Exports. */}
      {exportOpen && groupId && (
        <FahrtenbuchExportDialog
          open
          groupId={groupId}
          vehicles={vehicles}
          onClose={() => setExportOpen(false)}
        />
      )}

      {/* Bedingtes Mounten (plus key): der Dialog liest seinen Anfangszustand
          nur beim Mounten — sonst zeigt er beim zweiten Öffnen alte Werte. */}
      {dialogOpen && groupId && (
        <FahrtenbuchDialog
          key={`${editEntry?.id ?? 'new'}-${dialogVehicleId ?? ''}`}
          open
          groupId={groupId}
          vehicles={dialogVehicles}
          persons={activePersons}
          firecalls={firecalls}
          entries={entries}
          vehicleId={dialogVehicleId}
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
