'use client';

import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useContext, useMemo, useState } from 'react';
import { FirecallItem, FirecallLocation } from '../firebase/firestore';
import { formatTimestamp } from '../../common/time-format';
import { FirecallContext } from '../../hooks/useFirecall';
import useLocationLayers from '../../hooks/useLocationLayers';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import { StrengthGroup, StrengthRow, calculateStrength } from './fahrzeuge-utils';
import {
  currentLocationId,
  locationLabel,
  moveItemToLocation,
} from './location-assignment';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import {
  getLocationDisplayName,
  vehicleAssignedEntry,
  vehicleRemovedEntry,
} from '../Einsatzorte/locationDiary';
import useLocationDiary from '../Einsatzorte/useLocationDiary';

const BASE_COLUMNS = 8;

/** Was die Tabelle zum Bearbeiten braucht — ohne sie bleibt sie reine Anzeige. */
interface Editing {
  locations: FirecallLocation[];
  onEdit: (row: StrengthRow) => void;
  /** `locationId` leer heißt: von jedem Einsatzort abziehen. */
  onAssign: (row: StrengthRow, locationId: string) => void;
}

function LocationSelect({
  row,
  locations,
  onAssign,
}: {
  row: StrengthRow;
  locations: FirecallLocation[];
  onAssign: Editing['onAssign'];
}) {
  const t = useTranslations('einsatzmittel');
  // Eine Einheit steht immer nur an einem Einsatzort — deshalb eine
  // Einfachauswahl; ein neuer Ort zieht sie vom bisherigen ab.
  const selected = useMemo(
    () => currentLocationId(locations, row),
    [locations, row],
  );

  return (
    <Select
      displayEmpty
      variant="standard"
      size="small"
      value={selected}
      onChange={(e) => onAssign(row, e.target.value)}
      inputProps={{ 'aria-label': t('locationFor', { name: row.name }) }}
      sx={{ minWidth: 120, maxWidth: 240, fontSize: 'body2.fontSize' }}
    >
      <MenuItem value="">
        <Typography variant="body2" color="text.secondary" component="span">
          {t('noLocation')}
        </Typography>
      </MenuItem>
      {locations.map((l) => (
        <MenuItem key={l.id} value={l.id}>
          {locationLabel(l)}
        </MenuItem>
      ))}
    </Select>
  );
}

function StrengthRows({
  rows,
  editing,
}: {
  rows: StrengthRow[];
  editing?: Editing;
}) {
  const t = useTranslations('einsatzmittel');
  return (
    <>
      {rows.map((row, i) => (
        <TableRow key={row.id || i}>
          <TableCell>{row.name}</TableCell>
          <TableCell>{row.fw || ''}</TableCell>
          <TableCell>{row.typ}</TableCell>
          <TableCell align="right">{row.mann}</TableCell>
          <TableCell align="right">{row.ats}</TableCell>
          <TableCell>{row.alarmierung ? formatTimestamp(row.alarmierung) : ''}</TableCell>
          <TableCell>{row.eintreffen ? formatTimestamp(row.eintreffen) : ''}</TableCell>
          <TableCell>{row.abruecken ? formatTimestamp(row.abruecken) : ''}</TableCell>
          {editing && editing.locations.length > 0 && (
            <TableCell>
              {row.id && (
                <LocationSelect
                  row={row}
                  locations={editing.locations}
                  onAssign={editing.onAssign}
                />
              )}
            </TableCell>
          )}
          {editing && (
            <TableCell padding="none" align="right">
              {row.id && (
                <Tooltip title={t('editItem', { name: row.name })}>
                  <IconButton
                    size="small"
                    aria-label={t('editItem', { name: row.name })}
                    onClick={() => editing.onEdit(row)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </TableCell>
          )}
        </TableRow>
      ))}
    </>
  );
}

function TotalRow({
  label,
  group,
  trailing,
}: {
  label: string;
  group: StrengthGroup;
  trailing: number;
}) {
  const t = useTranslations('einsatzmittel');
  return (
    <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
      <TableCell>{label}</TableCell>
      <TableCell>{t('totalFw', { count: group.totalFw })}</TableCell>
      <TableCell>
        {Object.entries(group.typCounts).map(([typ, count]) => (
          <Typography variant="body2" sx={{ fontWeight: 'bold' }} key={typ}>
            {count} {typ}
          </Typography>
        ))}
      </TableCell>
      <TableCell align="right">{group.totalMann}</TableCell>
      <TableCell align="right">{group.totalAts}</TableCell>
      <TableCell colSpan={trailing} />
    </TableRow>
  );
}

function SectionRow({ label, columns }: { label: string; columns: number }) {
  return (
    <TableRow>
      <TableCell
        colSpan={columns}
        sx={{ fontWeight: 'bold', backgroundColor: 'action.hover' }}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

function StrengthTableView({
  items,
  editing,
}: {
  items: FirecallItem[];
  editing?: Editing;
}) {
  const t = useTranslations('einsatzmittel');
  const { crewAssignments } = useContext(FirecallContext);
  const summary = useMemo(
    () => calculateStrength(items, crewAssignments),
    [items, crewAssignments]
  );
  const { rows, eigene, fremde } = summary;

  if (rows.length === 0) return null;

  const showLocations = !!editing && editing.locations.length > 0;
  const extraColumns = (showLocations ? 1 : 0) + (editing ? 1 : 0);
  const columns = BASE_COLUMNS + extraColumns;
  // Die Gesamtzeile füllt hinter den Summen bis zum Ende auf.
  const trailing = 3 + extraColumns;

  // Ohne Fremdkräfte bleibt die Tabelle, wie sie war: eine Liste, eine
  // Gesamtzeile. Ein leerer Abschnitt „Fremdkräfte" an jedem Einsatz, an dem
  // nur die eigene Wehr ausgerückt ist, wäre Ballast.
  const split = fremde.rows.length > 0;

  return (
    <TableContainer component={Paper} sx={{ mb: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('cols.name')}</TableCell>
            <TableCell>{t('cols.fwShort')}</TableCell>
            <TableCell>{t('cols.type')}</TableCell>
            <TableCell align="right">{t('cols.strength')}</TableCell>
            <TableCell align="right">{t('cols.ats')}</TableCell>
            <TableCell>{t('cols.alarmierung')}</TableCell>
            <TableCell>{t('cols.eintreffen')}</TableCell>
            <TableCell>{t('cols.abruecken')}</TableCell>
            {showLocations && <TableCell>{t('cols.location')}</TableCell>}
            {editing && <TableCell padding="none" />}
          </TableRow>
        </TableHead>
        <TableBody>
          {split ? (
            <>
              {/* Zuerst die eigenen Kräfte: Die Einsatzleitung führt sie, und
                  die Frage „wie viele habe ich" steht vor der Frage „wer ist
                  sonst noch da". */}
              <SectionRow label={t('ownForces')} columns={columns} />
              <StrengthRows rows={eigene.rows} editing={editing} />
              <TotalRow label={t('ownForcesTotal')} group={eigene} trailing={trailing} />
              <SectionRow label={t('foreignForces')} columns={columns} />
              <StrengthRows rows={fremde.rows} editing={editing} />
              <TotalRow label={t('foreignForcesTotal')} group={fremde} trailing={trailing} />
            </>
          ) : (
            <StrengthRows rows={rows} editing={editing} />
          )}
          <TotalRow label={t('total')} group={summary} trailing={trailing} />
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Bearbeitbare Fassung: Bearbeiten-Knopf je Zeile und Zuordnung zu den
 * Einsatzorten. Eigene Komponente, damit Druckansicht und Einsatzdetails
 * kein Abo auf die Einsatzorte brauchen.
 */
function EditableStrengthTable({ items }: { items: FirecallItem[] }) {
  const { locations, updateLocation } = useFirecallLocations();
  const [editItem, setEditItem] = useState<FirecallItem>();

  const onEdit = useCallback(
    (row: StrengthRow) => setEditItem(items.find((i) => i.id === row.id)),
    [items],
  );
  const addDiaryEntry = useLocationDiary();
  const { saveHistory } = useSaveHistory();
  const locationLayers = useLocationLayers();

  // Wie auf der Seite „Einsatzorte": erst den Verlaufsstand sichern, dann
  // zuordnen und jeden Wechsel ins Einsatztagebuch schreiben.
  const onAssign = useCallback(
    async (row: StrengthRow, locationId: string) => {
      const move = moveItemToLocation(locations, row, locationId);
      if (move.updates.length === 0) return;

      const anlass = move.assignedTo
        ? `Status vor ${row.name} zu Einsatzort ${getLocationDisplayName(move.assignedTo)} zugeordnet`
        : `Status vor ${row.name} von Einsatzort abgezogen`;
      await saveHistory(anlass);

      for (const update of move.updates) {
        void updateLocation(update.id, { vehicles: update.vehicles });
      }
      for (const location of move.removedFrom) {
        void addDiaryEntry(vehicleRemovedEntry(row.name, location));
      }
      const item = items.find((i) => i.id === row.id);
      if (move.assignedTo) {
        void addDiaryEntry(vehicleAssignedEntry(row.name, move.assignedTo));
        // Auf der Karte zum Einsatzort versetzen und in seine Ebene legen
        if (item) void locationLayers.placeItem(item, move.assignedTo);
      } else if (item) {
        for (const location of move.removedFrom) {
          void locationLayers.releaseItem(item, location);
        }
      }
    },
    [
      addDiaryEntry,
      items,
      locationLayers,
      locations,
      saveHistory,
      updateLocation,
    ],
  );
  const editing = useMemo(
    () => ({ locations, onEdit, onAssign }),
    [locations, onEdit, onAssign],
  );

  return (
    <>
      <StrengthTableView items={items} editing={editing} />
      {editItem && (
        <FirecallItemUpdateDialog
          item={editItem}
          callback={() => setEditItem(undefined)}
        />
      )}
    </>
  );
}

export default function StrengthTable({
  items,
  editable = false,
}: {
  items: FirecallItem[];
  /** Bearbeiten und Einsatzorte zuordnen — nur auf der Seite „Einsatzmittel". */
  editable?: boolean;
}) {
  return editable ? (
    <EditableStrengthTable items={items} />
  ) : (
    <StrengthTableView items={items} />
  );
}
