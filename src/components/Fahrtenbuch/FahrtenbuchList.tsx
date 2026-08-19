'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  driverNamesOf,
  FAHRT_ZWECKE,
  type FahrtZweck,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  EMPTY_FAHRTENBUCH_LIST_FILTER,
  driverOptionsOf,
  filterFahrtenbuchEntries,
  hasActiveFahrtenbuchListFilter,
  type FahrtenbuchListFilter,
} from '../../common/fahrtenbuchListFilter';
import { browserTimeZone } from '../../common/fahrtenbuchStats';
import { counterLines, fuelLines, type CounterLine } from './entrySummary';

export interface FahrtenbuchListProps {
  entries: FahrtenbuchEntry[];
  /**
   * Alle Fahrzeuge der Gruppe — auch stillgelegte, damit deren alte Fahrten
   * noch eine Zählerbeschriftung bekommen. Der Filter zeigt nur aktive.
   */
  vehicles: FahrtenbuchVehicle[];
  /** Blendet den Fahrzeugfilter aus — in der Fahrzeug-Ansicht überflüssig. */
  hideVehicleFilter?: boolean;
  /**
   * Blendet die Filterzeile ganz aus. Für die Statistik, die ihre eigenen
   * Filter führt: Ein zweiter Satz Filter in der Liste könnte dem Ausschnitt
   * widersprechen, den die Diagramme zeigen.
   */
  hideFilters?: boolean;
  /**
   * Der Filterzustand. Ohne diese beiden Eigenschaften führt die Liste ihn
   * selbst — die Seiten geben ihn vor, weil bei ihnen der Zeitraum auch die
   * Firestore-Abfrage weitet und der Zustand in der URL steht
   * (`useFahrtenbuchListFilter`).
   */
  filter?: FahrtenbuchListFilter;
  onFilterChange?: (filter: FahrtenbuchListFilter) => void;
  /**
   * Ohne Handler bleibt die Liste eine reine Anzeige und zeigt keine
   * Bearbeiten-/Löschen-Knöpfe. Der Defekt-Hinweis bleibt — er gehört zur
   * Fahrt, nicht zur Bedienung.
   */
  onEdit?: (entry: FahrtenbuchEntry) => void;
  onDelete?: (entry: FahrtenbuchEntry) => void;
}

/**
 * Die Fahrer einer Fahrt in einer schmalen Spalte: Hauptfahrer im Klartext,
 * der Rest als Zahl mit allen Namen im Tooltip. Alle Namen ausgeschrieben
 * machten die Zelle in einer Tabelle mit acht Spalten mehrzeilig.
 */
function DriverCell({ entry }: { entry: FahrtenbuchEntry }) {
  const t = useTranslations('fahrtenbuch');
  const count = (entry.coDrivers ?? []).filter((ref) => ref.name?.trim()).length;
  if (count === 0) return <>{entry.driverName}</>;
  const all = driverNamesOf(entry);
  return (
    <Tooltip title={all}>
      <Box component="span" aria-label={all} sx={{ whiteSpace: 'nowrap' }}>
        {entry.driverName}{' '}
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {t('moreDrivers', { count })}
        </Box>
      </Box>
    </Tooltip>
  );
}

export default function FahrtenbuchList({
  entries,
  vehicles,
  hideVehicleFilter,
  hideFilters,
  filter: filterProp,
  onFilterChange,
  onEdit,
  onDelete,
}: FahrtenbuchListProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();
  const [ownFilter, setOwnFilter] = useState(EMPTY_FAHRTENBUCH_LIST_FILTER);
  const filter = filterProp ?? ownFilter;
  const setFilter = onFilterChange ?? setOwnFilter;
  const change = (patch: Partial<FahrtenbuchListFilter>) =>
    setFilter({ ...filter, ...patch });

  // Der Zeitraum meint den Tag, an dem die Fahrt vor Ort begonnen hat.
  const timeZone = useMemo(() => browserTimeZone(), []);

  const filtered = useMemo(
    () => filterFahrtenbuchEntries(entries, filter, timeZone),
    [entries, filter, timeZone],
  );

  /**
   * Die Fahrerauswahl entsteht aus allen übergebenen Fahrten, nicht aus den
   * gefilterten: Sonst bliebe nach der Auswahl nur noch dieser eine Fahrer
   * übrig und es gäbe keinen Weg zu einem anderen.
   */
  const driverOptions = useMemo(() => driverOptionsOf(entries), [entries]);
  /**
   * Ein Fahrer aus der URL, zu dem keine Fahrt geladen ist, wäre für das
   * Auswahlfeld ein unbekannter Wert — MUI zeigt dann leer, und der aktive
   * Filter wäre unsichtbar.
   */
  const driverChoices = useMemo(
    () =>
      filter.driverKey &&
      !driverOptions.some((option) => option.key === filter.driverKey)
        ? [...driverOptions, { key: filter.driverKey, name: filter.driverKey }]
        : driverOptions,
    [driverOptions, filter.driverKey],
  );

  const filterActive = hasActiveFahrtenbuchListFilter(filter);

  const vehiclesById = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v])),
    [vehicles],
  );

  /**
   * In der Tabelle steht die Kurzform der Beschriftung („km-Stand" statt
   * „Kilometerstand"): Ausgeschrieben war die Zählerspalte breiter als die
   * Fahrstrecke daneben. Nur Preset-Zähler haben eine Kurzform — ein selbst
   * benannter Zähler behält seine Beschriftung.
   */
  const counterLabel = (line: CounterLine) => {
    if (!line.labelKey) return line.label;
    const shortKey = line.labelKey.replace(
      'counters.',
      'countersShort.',
    ) as 'countersShort.km';
    return t.has(shortKey) ? t(shortKey) : t(line.labelKey as 'counters.km');
  };

  /**
   * Die Zählerstände einer Fahrt: je Zähler eine beschriftete Zeile mit Start,
   * Ende und Differenz. Nur die Differenz zu zeigen reichte nicht — bei einem
   * Fahrzeug mit mehreren Zählern war nicht erkennbar, welche Zahl zu welchem
   * Zähler gehört, und der abgelesene Stand fehlte ganz.
   */
  const counterCell = (entry: FahrtenbuchEntry) => (
    <Stack spacing={0.25}>
      {counterLines(entry, vehiclesById.get(entry.vehicleId)).map((line) => (
        <Typography
          key={line.counterId}
          variant="body2"
          sx={{ whiteSpace: 'nowrap' }}
        >
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {counterLabel(line)}
            {': '}
          </Box>
          {line.value}
          {line.diff && (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {` (${line.diff})`}
            </Box>
          )}
        </Typography>
      ))}
    </Stack>
  );

  /**
   * Spaltenbreiten: Alle Spalten außer der Fahrstrecke schrumpfen auf ihren
   * Inhalt (`width: '1%'` plus `nowrap`), die Fahrstrecke bekommt mit
   * `width: '99%'` den ganzen Rest. Ohne das verteilte der Browser die Breite
   * gleichmäßig — auf einem breiten Monitor blieb die Fahrstrecke schmal,
   * während die Zählerspalte mehr Platz hatte als sie braucht.
   */
  const tightCell = { width: '1%', whiteSpace: 'nowrap' } as const;

  const fuelCell = (entry: FahrtenbuchEntry) => (
    <Stack spacing={0.25}>
      {fuelLines(entry).map(({ fuel, amount }) => (
        <Typography key={fuel} variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {t(`fuel.${fuel}` as 'fuel.diesel')}
            {': '}
          </Box>
          {`${amount} ${t('fuelUnit')}`}
        </Typography>
      ))}
    </Stack>
  );

  return (
    <Box>
      {!hideFilters && (
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {/* Die Suche steht vorne und breiter als die Auswahlfelder: Sie ist
              der Einstieg, wenn man eine bestimmte Fahrt sucht. */}
          <TextField
            size="small"
            label={t('filters.search')}
            placeholder={t('filters.searchPlaceholder')}
            value={filter.search}
            onChange={(e) => change({ search: e.target.value })}
            sx={{ minWidth: 240, flexGrow: 1, maxWidth: 420 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            type="date"
            size="small"
            label={t('filters.from')}
            value={filter.from}
            onChange={(e) => change({ from: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            size="small"
            label={t('filters.to')}
            value={filter.to}
            onChange={(e) => change({ to: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {!hideVehicleFilter && (
            <TextField
              select
              size="small"
              label={t('filters.vehicle')}
              value={filter.vehicleId}
              onChange={(e) => change({ vehicleId: e.target.value })}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">{t('filters.all')}</MenuItem>
              {vehicles
                .filter((v) => v.active !== false)
                .map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.name}
                  </MenuItem>
                ))}
            </TextField>
          )}
          <TextField
            select
            size="small"
            label={t('filters.driver')}
            value={filter.driverKey}
            onChange={(e) => change({ driverKey: e.target.value })}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">{t('filters.all')}</MenuItem>
            {driverChoices.map((option) => (
              <MenuItem key={option.key} value={option.key}>
                {option.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label={t('filters.zweck')}
            value={filter.zweck}
            onChange={(e) =>
              change({ zweck: e.target.value as FahrtZweck | '' })
            }
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">{t('filters.all')}</MenuItem>
            {FAHRT_ZWECKE.map((z) => (
              <MenuItem key={z} value={z}>
                {t(`zwecke.${z}` as 'zwecke.einsatz')}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={filter.onlyDefects}
                onChange={(e) => change({ onlyDefects: e.target.checked })}
              />
            }
            label={t('filters.onlyDefects')}
          />
          {filterActive && (
            <Button
              size="small"
              onClick={() => setFilter(EMPTY_FAHRTENBUCH_LIST_FILTER)}
            >
              {t('filters.reset')}
            </Button>
          )}
        </Stack>
      )}

      {filtered.length === 0 ? (
        // „Keine Fahrten" und „nichts passt zum Filter" sind zwei verschiedene
        // Auskünfte: Beim gesetzten Filter ist die Liste nicht leer, sondern
        // die Suche zu eng. Der Weg zurück steht im Filterband darüber.
        <Typography color="text.secondary">
          {filterActive && !hideFilters
            ? t('filters.noResults')
            : t('noEntries')}
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={tightCell}>{t('abfahrt')}</TableCell>
                {!hideVehicleFilter && (
                  <TableCell sx={tightCell}>{t('vehicle')}</TableCell>
                )}
                <TableCell sx={tightCell}>{t('driver')}</TableCell>
                <TableCell sx={tightCell}>{t('zweck')}</TableCell>
                <TableCell sx={{ width: '99%' }}>{t('ziel')}</TableCell>
                <TableCell sx={tightCell}>{t('counterReadings')}</TableCell>
                <TableCell sx={tightCell}>{t('betriebsmittel')}</TableCell>
                <TableCell sx={tightCell} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell sx={tightCell}>
                    {format.dateTime(new Date(entry.abfahrt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  {!hideVehicleFilter && (
                    <TableCell sx={tightCell}>{entry.vehicleName}</TableCell>
                  )}
                  <TableCell sx={tightCell}>
                    <DriverCell entry={entry} />
                  </TableCell>
                  <TableCell sx={tightCell}>
                    {t(`zwecke.${entry.zweck}` as 'zwecke.einsatz')}
                  </TableCell>
                  {/* Bei einer Einsatzfahrt darf das Ziel leer bleiben — der
                      Einsatz benennt es. Derselbe Rückfall wie im Export. */}
                  <TableCell>
                    {entry.ziel?.trim() || entry.firecallName || ''}
                  </TableCell>
                  <TableCell sx={tightCell}>{counterCell(entry)}</TableCell>
                  <TableCell sx={tightCell}>{fuelCell(entry)}</TableCell>
                  <TableCell align="right" sx={tightCell}>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
                    >
                      {entry.defekt && (
                        // Einträge aus der Zeit vor dem eigenen Mangelfeld
                        // tragen nur das Häkchen — dort bleibt der allgemeine
                        // Vermerk die einzige Auskunft.
                        <Tooltip
                          title={entry.mangel?.trim() || t('defectReported')}
                        >
                          <WarningAmberIcon color="warning" fontSize="small" />
                        </Tooltip>
                      )}
                      {onEdit && (
                        <Tooltip title={t('editEntry')}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => onEdit(entry)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {onDelete && (
                        <Tooltip title={t('deleteEntry')}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => onDelete(entry)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
