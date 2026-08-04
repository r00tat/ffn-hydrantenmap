'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
import useFahrtenbuchEntries from '../../hooks/useFahrtenbuchEntries';
import useFahrtenbuchFirecalls from '../../hooks/useFahrtenbuchFirecalls';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFahrtenbuchVehicles from '../../hooks/useFahrtenbuchVehicles';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import FahrtenbuchDialog from './FahrtenbuchDialog';
import FahrtenbuchList from './FahrtenbuchList';
import FahrtenbuchVehicleCard from './FahrtenbuchVehicleCard';
import useEntryDeletion from './useEntryDeletion';

/**
 * Übersicht des Fahrtenbuchs: eine Karte je aktivem Fahrzeug mit Direkt-Button,
 * darunter eingeklappt die gruppenweite Fahrtenliste mit Filtern.
 */
export default function FahrtenbuchPage() {
  const t = useTranslations('fahrtenbuch');
  const { isAuthorized } = useFirebaseLogin();
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const { vehicles, activeVehicles } = useFahrtenbuchVehicles(groupId);
  const { activePersons } = useFahrtenbuchPersons(groupId);
  const entries = useFahrtenbuchEntries(groupId);
  const firecalls = useFahrtenbuchFirecalls(groupId);
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

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
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
          {activeVehicles.map((vehicle) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={vehicle.id}>
              <FahrtenbuchVehicleCard
                groupId={groupId as string}
                vehicle={vehicle}
                lastEntryHasDefect={
                  lastEntryByVehicle.get(vehicle.id as string)?.defekt
                }
                lastDriverName={
                  lastEntryByVehicle.get(vehicle.id as string)?.driverName
                }
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
            entries={entries}
            vehicles={vehicles}
            onEdit={(entry) => openDialog(entry.vehicleId, entry)}
            onDelete={requestDelete}
          />
        </AccordionDetails>
      </Accordion>

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
