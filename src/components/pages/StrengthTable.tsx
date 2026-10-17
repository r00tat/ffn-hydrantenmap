'use client';

import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useContext, useMemo, useState } from 'react';
import { FirecallItem, FirecallLocation, Fzg } from '../firebase/firestore';
import { formatTimestamp } from '../../common/time-format';
import { FirecallContext } from '../../hooks/useFirecall';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import {
  StrengthGroup,
  StrengthRow,
  calculateStrength,
  filterStrength,
} from './fahrzeuge-utils';
import {
  currentLocationId,
  locationLabel,
} from './location-assignment';
import useAssignToLocation from '../Einsatzorte/useAssignToLocation';

const BASE_COLUMNS = 8;

/** Was die Tabelle zum Bearbeiten braucht — ohne sie bleibt sie reine Anzeige. */
interface Editing {
  locations: FirecallLocation[];
  onEdit: (row: StrengthRow) => void;
  /** `locationId` leer heißt: von jedem Einsatzort abziehen. */
  onAssign: (row: StrengthRow, locationId: string) => void;
  /** Die taktischen Einheiten des Einsatzes — leer heißt: keine Spalte „Einheit". */
  units: FirecallItem[];
  /** `unitId` leer heißt: aus der Einheit lösen. */
  onUnitChange: (row: StrengthRow, unitId: string) => void;
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

function UnitSelect({
  row,
  units,
  onUnitChange,
}: {
  row: StrengthRow;
  units: FirecallItem[];
  onUnitChange: Editing['onUnitChange'];
}) {
  const t = useTranslations('einsatzmittel');
  return (
    <Select
      displayEmpty
      variant="standard"
      size="small"
      value={row.parentId ?? ''}
      onChange={(e) => onUnitChange(row, e.target.value)}
      inputProps={{ 'aria-label': t('unitFor', { name: row.name }) }}
      sx={{ minWidth: 100, maxWidth: 200, fontSize: 'body2.fontSize' }}
    >
      <MenuItem value="">
        <Typography variant="body2" color="text.secondary" component="span">
          {t('noUnit')}
        </Typography>
      </MenuItem>
      {units.map((u) => (
        <MenuItem key={u.id} value={u.id}>
          {u.name}
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
          {/* Fahrzeuge einer Einheit stehen eingerückt unter ihr. */}
          <TableCell sx={row.parentId ? { pl: 4 } : undefined}>
            {row.name}
          </TableCell>
          <TableCell>{row.fw || ''}</TableCell>
          <TableCell>{row.typ}</TableCell>
          <TableCell align="right">{row.mann}</TableCell>
          <TableCell align="right">{row.ats}</TableCell>
          <TableCell>{row.alarmierung ? formatTimestamp(row.alarmierung) : ''}</TableCell>
          <TableCell>{row.eintreffen ? formatTimestamp(row.eintreffen) : ''}</TableCell>
          <TableCell>{row.abruecken ? formatTimestamp(row.abruecken) : ''}</TableCell>
          {editing && editing.units.length > 0 && (
            <TableCell>
              {/* Nur ein Fahrzeug gehört einer Einheit an — der Typ der
                  Zeile ist dafür nicht eindeutig, die Einheit-ID schon. */}
              {row.id && !editing.units.some((u) => u.id === row.id) && (
                <UnitSelect
                  row={row}
                  units={editing.units}
                  onUnitChange={editing.onUnitChange}
                />
              )}
            </TableCell>
          )}
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

function StrengthFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('einsatzmittel');
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('filterPlaceholder')}
      sx={{ mb: 1, width: { xs: '100%', sm: 320 } }}
      slotProps={{
        htmlInput: { 'aria-label': t('filter') },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label={t('clearFilter')}
                onClick={() => onChange('')}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}

function StrengthTableView({
  items,
  editing,
  filterable = false,
}: {
  items: FirecallItem[];
  editing?: Editing;
  filterable?: boolean;
}) {
  const t = useTranslations('einsatzmittel');
  const { crewAssignments } = useContext(FirecallContext);
  const [filter, setFilter] = useState('');
  const fullSummary = useMemo(
    () => calculateStrength(items, crewAssignments),
    [items, crewAssignments]
  );
  const locations = editing?.locations;
  // Summen und Abschnitte folgen dem Filter (siehe `filterStrength`). Der
  // Einsatzort steht nicht an der Zeile; gesucht wird nach seinem Namen, so
  // wie ihn die Spalte zeigt.
  const summary = useMemo(
    () =>
      filterStrength(fullSummary, filter, (row) => {
        const id = locations ? currentLocationId(locations, row) : '';
        const location = id ? locations?.find((l) => l.id === id) : undefined;
        return location ? locationLabel(location) : '';
      }),
    [fullSummary, filter, locations],
  );
  const { rows, eigene, fremde } = summary;

  // Ohne Einsatzmittel keine Tabelle; passt nur nichts zum Filter, bleibt sie
  // samt Suchfeld stehen, damit sich der Filter wieder leeren lässt.
  if (fullSummary.rows.length === 0) return null;

  const showLocations = !!editing && editing.locations.length > 0;
  const showUnits = !!editing && editing.units.length > 0;
  const extraColumns =
    (showUnits ? 1 : 0) + (showLocations ? 1 : 0) + (editing ? 1 : 0);
  const columns = BASE_COLUMNS + extraColumns;
  // Die Gesamtzeile füllt hinter den Summen bis zum Ende auf.
  const trailing = 3 + extraColumns;

  // Ohne Fremdkräfte bleibt die Tabelle, wie sie war: eine Liste, eine
  // Gesamtzeile. Ein leerer Abschnitt „Fremdkräfte" an jedem Einsatz, an dem
  // nur die eigene Wehr ausgerückt ist, wäre Ballast.
  const split = fremde.rows.length > 0;

  return (
    <TableContainer component={Paper} sx={{ mb: 3 }}>
      {filterable && (
        <Box sx={{ px: 2, pt: 2 }}>
          <StrengthFilter value={filter} onChange={setFilter} />
        </Box>
      )}
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
            {showUnits && <TableCell>{t('cols.unit')}</TableCell>}
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
          ) : rows.length > 0 ? (
            <StrengthRows rows={rows} editing={editing} />
          ) : (
            <TableRow>
              <TableCell colSpan={columns}>
                <Typography variant="body2" color="text.secondary">
                  {t('noFilterMatch')}
                </Typography>
              </TableCell>
            </TableRow>
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
function EditableStrengthTable({
  items,
  filterable,
}: {
  items: FirecallItem[];
  filterable?: boolean;
}) {
  const { locations, updateLocation } = useFirecallLocations();
  const [editItem, setEditItem] = useState<FirecallItem>();

  const onEdit = useCallback(
    (row: StrengthRow) => setEditItem(items.find((i) => i.id === row.id)),
    [items],
  );
  const assign = useAssignToLocation(locations, updateLocation, items);
  const onAssign = useCallback(
    (row: StrengthRow, locationId: string) => assign(row, locationId),
    [assign],
  );

  const updateItem = useFirecallItemUpdate();
  const units = useMemo(
    () => items.filter((i) => i.type === 'tacticalUnit' && i.id),
    [items],
  );
  // Ein Fahrzeug, das einer Einheit beitritt, steht danach dort, wo sie
  // steht — sonst zöge es beim nächsten Versetzen von einem anderen Ort mit.
  const onUnitChange = useCallback(
    async (row: StrengthRow, unitId: string) => {
      const item = items.find((i) => i.id === row.id) as Fzg | undefined;
      if (!item) return;
      const updated: Fzg = { ...item, tacticalUnitId: unitId || undefined };
      await updateItem(updated);
      const unit = units.find((u) => u.id === unitId);
      const unitLocation = unit ? currentLocationId(locations, unit) : '';
      if (unitLocation && unitLocation !== currentLocationId(locations, row)) {
        await onAssign(row, unitLocation);
      }
    },
    [items, locations, onAssign, units, updateItem],
  );
  const editing = useMemo(
    () => ({ locations, onEdit, onAssign, units, onUnitChange }),
    [locations, onEdit, onAssign, units, onUnitChange],
  );

  return (
    <>
      <StrengthTableView
        items={items}
        editing={editing}
        filterable={filterable}
      />
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
  filterable = false,
}: {
  items: FirecallItem[];
  /** Bearbeiten und Einsatzorte zuordnen — nur auf der Seite „Einsatzmittel". */
  editable?: boolean;
  /**
   * Suchfeld über der Tabelle — nur auf der Seite „Einsatzmittel". Druckansicht
   * und Einsatzdetails zeigen immer alle Einsatzmittel.
   */
  filterable?: boolean;
}) {
  return editable ? (
    <EditableStrengthTable items={items} filterable={filterable} />
  ) : (
    <StrengthTableView items={items} filterable={filterable} />
  );
}
