'use client';

import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  FUEL_TYPES,
  matchVehicleByName,
  normalizeName,
  type FuelType,
} from '../../../common/fahrtenbuch';
import useFahrtenbuchEntries from '../../../hooks/useFahrtenbuchEntries';
import useFahrtenbuchPersons from '../../../hooks/useFahrtenbuchPersons';
import useFahrtenbuchVehicles from '../../../hooks/useFahrtenbuchVehicles';
import { importFahrtenbuchEntries } from '../fahrtenbuchActions';
import {
  planFahrtenbuchImport,
  unknownDriverNames,
  type ImportPlanRow,
  type ImportRowEdit,
} from '../fahrtenbuchImportPlan';
import {
  extractPdfItems,
  parseFahrtenbuchPdf,
  type PdfParseResult,
} from '../fahrtenbuchPdfImport';
import { createInactivePersons } from '../stammdatenActions';
import ImportRowEditDialog from './ImportRowEditDialog';

/**
 * Ergebnis der letzten Aktion als Daten, nicht als fertiger Text. `parseFailed`
 * trägt einen Übersetzungsschlüssel, `parseCrashed` eine rohe Fehlermeldung —
 * getrennt, weil sonst eine Ausnahmemeldung als Schlüssel nachgeschlagen würde
 * und `next-intl` mit einem fehlenden Schlüssel antwortete.
 */
type ImportStatus =
  | { kind: 'parseFailed'; reason: 'unknownFormat' | 'empty' }
  | { kind: 'parseCrashed'; error: string }
  | { kind: 'importFailed'; error: string }
  | {
      kind: 'imported';
      created: number;
      duplicates: number;
      failed: number;
      /** Angelegte deaktivierte Personen für unbekannte Fahrer. */
      persons: number;
    };

/**
 * Die Schlüssel, die `importFahrtenbuchEntries` und `createInactivePersons`
 * als `error` melden können. Alles andere gibt die Action als Klartext der
 * Ausnahme zurück und wird unübersetzt durchgereicht — ein „tooManyEntries"
 * mitten im Satz ist dagegen für niemanden ein Satz.
 */
const KNOWN_ERROR_KEYS = [
  'tooManyEntries',
  'tooManyPersons',
  'notInGroup',
  'notLoggedIn',
] as const;

type KnownErrorKey = (typeof KNOWN_ERROR_KEYS)[number];

function isKnownErrorKey(error: string): error is KnownErrorKey {
  return (KNOWN_ERROR_KEYS as readonly string[]).includes(error);
}

/**
 * Übernimmt die Fahrten aus dem PDF-Export eines anderen digitalen
 * Fahrtenbuchs. Die Datei wird ausschließlich im Browser gelesen — sie geht
 * nie an den Server, nur die bestätigten Eintragsentwürfe tun das.
 * Vorausgewählt ist, was vollständig ist; Dubletten und Problemzeilen bleiben
 * sichtbar, aber abgewählt, damit der Admin sieht, was er in ein
 * Nachweisdokument schreibt. Jede Zeile lässt sich vorher korrigieren — ein
 * Export nennt Fahrer gern abgekürzt, und eine falsch gelesene Zeile ist so
 * zu retten, statt sie später von Hand nachzutragen.
 *
 * Ein Panel und kein Dialog: die Vorschau hat neun Spalten und bis zu 156
 * Zeilen, ein Modal schnürte sie unnötig ein.
 */
export default function FahrtenbuchImport({
  groupId,
  groupName,
}: {
  groupId: string;
  /** Zielgruppe im Klartext — die Gruppenauswahl steht außerhalb des Panels. */
  groupName: string;
}) {
  const t = useTranslations('fahrtenbuch');
  const { activeVehicles, vehiclesById } = useFahrtenbuchVehicles(groupId);
  const { persons } = useFahrtenbuchPersons(groupId);
  const [vehicleId, setVehicleId] = useState('');
  const [fuelType, setFuelType] = useState<FuelType | ''>('');
  const [parsed, setParsed] = useState<PdfParseResult>();
  /** `undefined` heißt „noch nicht angefasst" — dann gilt die Vorauswahl. */
  const [selected, setSelected] = useState<Set<number>>();
  /** Korrekturen je Zeilennummer; die gelesene Zeile bleibt unangetastet. */
  const [edits, setEdits] = useState<Record<number, ImportRowEdit>>({});
  const [editingLine, setEditingLine] = useState<number>();
  const [status, setStatus] = useState<ImportStatus>();
  const [busy, setBusy] = useState(false);

  const vehicle = vehiclesById.get(vehicleId);
  // Der Bestand des gewählten Fahrzeugs — Grundlage der Dublettenprüfung.
  // Ohne Fenstergrenze: ein Import trifft gerade die alten Fahrten. Ohne
  // gewähltes Fahrzeug gäbe es nichts zu vergleichen, deshalb bleibt die
  // Abfrage bis dahin aus — sonst lüde der Dialog beim Öffnen 1000 Fahrten
  // der ganzen Gruppe.
  const entries = useFahrtenbuchEntries(vehicleId ? groupId : undefined, {
    vehicleId,
    pageSize: 1000,
  });

  const rows = useMemo<ImportPlanRow[]>(() => {
    if (!parsed?.rows.length || !vehicle) return [];
    return planFahrtenbuchImport(parsed.rows, vehicle, persons, entries, {
      fuelType: fuelType || undefined,
      edits,
    });
  }, [parsed, vehicle, persons, entries, fuelType, edits]);

  // Die Kraftstoffauswahl gehört zum Fahrzeug: beim Wechsel verfällt sie,
  // sonst landete der Treibstoff des PDFs in der Spalte des Vorgängers.
  const chooseVehicle = (id: string) => {
    setVehicleId(id);
    setFuelType('');
  };

  const chooseFile = async (file: File) => {
    setBusy(true);
    setStatus(undefined);
    try {
      const result = parseFahrtenbuchPdf(
        await extractPdfItems(new Uint8Array(await file.arrayBuffer())),
      );
      setParsed(result);
      setSelected(undefined);
      setEdits({});
      if (result.error) {
        setStatus({ kind: 'parseFailed', reason: result.error });
        return;
      }
      // Fahrzeug aus dem Titel vorschlagen: erst über den Namen, dann über
      // das Kennzeichen — der Titel nennt beides.
      const match =
        matchVehicleByName(activeVehicles, result.vehicleName ?? '') ??
        activeVehicles.find(
          (v) =>
            v.kennzeichen &&
            normalizeName(v.kennzeichen) === normalizeName(result.kennzeichen ?? ''),
        );
      if (match?.id) chooseVehicle(match.id);
    } catch (err) {
      setParsed(undefined);
      setStatus({ kind: 'parseCrashed', error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Vorauswahl folgt dem Plan: Dubletten und Problemzeilen bleiben abgewählt,
  // bis der Admin sie bewusst anhakt. Eine Zeile mit unbekanntem Fahrer ist
  // dagegen vollständig — ihr Fahrer wird beim Übernehmen als deaktivierte
  // Person angelegt.
  const autoLines = useMemo(
    () =>
      rows
        .filter((r) => r.state === 'ready' || r.state === 'unknownDriver')
        .map((r) => r.line),
    [rows],
  );
  const effectiveSelection = selected ?? new Set(autoLines);

  // Die ausgewählten Zeilen sind die Grundlage von Hinweis und Lauf — beides
  // muss dieselbe Menge sehen.
  const chosen = rows.filter((r) => effectiveSelection.has(r.line) && r.input);
  const newDriverNames = unknownDriverNames(chosen);

  const editingRow = rows.find((r) => r.line === editingLine);

  /**
   * Übernimmt die Korrektur einer Zeile und hakt sie an: Wer eine Zeile
   * anfasst, will sie importieren — sonst müsste er sie danach noch suchen.
   * Bleibt sie trotz Korrektur ein Problem, greift der Haken nicht (die
   * Checkbox hängt an `r.input`).
   */
  const saveEdit = (line: number, edit: ImportRowEdit) => {
    setEdits((current) => ({ ...current, [line]: edit }));
    setSelected((current) => new Set(current ?? autoLines).add(line));
    setEditingLine(undefined);
  };

  const discardEdit = (line: number) => {
    setEdits((current) => {
      const next = { ...current };
      delete next[line];
      return next;
    });
    setEditingLine(undefined);
  };

  const run = async () => {
    setBusy(true);
    try {
      // Erst die Personen, dann die Fahrten: Ohne die IDs hinge jede Fahrt
      // eines ausgetretenen Fahrers an einem bloßen Namen. Scheitert das,
      // wird gar nichts geschrieben — ein zweiter Anlauf ist über die
      // Dublettenprüfung gefahrlos.
      let personIds: Record<string, string> = {};
      let personsCreated = 0;
      if (newDriverNames.length > 0) {
        const result = await createInactivePersons(groupId, newDriverNames);
        if (!result.success) {
          setStatus({ kind: 'importFailed', error: result.error ?? '' });
          return;
        }
        personIds = result.personIds;
        personsCreated = result.created;
      }

      const inputs = chosen.map((r) => {
        const input = r.input!;
        if (input.driverId) return input;
        const personId = personIds[normalizeName(input.driverName)];
        return personId ? { ...input, driverId: personId } : input;
      });

      const result = await importFahrtenbuchEntries(groupId, inputs);
      if (!result.success) {
        setStatus({ kind: 'importFailed', error: result.error ?? '' });
        return;
      }
      setStatus({
        kind: 'imported',
        created: result.created,
        duplicates: result.duplicates,
        failed: result.failed,
        persons: personsCreated,
      });
      setParsed(undefined);
      setSelected(undefined);
      setEdits({});
    } catch (err) {
      setStatus({ kind: 'importFailed', error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Zurück auf Null — im Panel gibt es kein Schließen, das den Zustand
  // verwirft, und nach einem Lauf will man dieselbe Fläche für die nächste
  // Datei nutzen. Das Fahrzeug bleibt stehen: es schlägt beim nächsten PDF
  // ohnehin wieder aus dem Titel an.
  const reset = () => {
    setParsed(undefined);
    setSelected(undefined);
    setEdits({});
    setStatus(undefined);
  };

  function statusMessage(current: ImportStatus): string {
    switch (current.kind) {
      case 'imported':
        return [
          t('admin.pdfImport.result', {
            created: current.created,
            duplicates: current.duplicates,
            failed: current.failed,
          }),
          current.persons > 0 &&
            t('admin.pdfImport.personsCreated', { count: current.persons }),
        ]
          .filter(Boolean)
          .join(' ');
      case 'parseFailed':
        return t('admin.pdfImport.parseFailed', {
          message: t(
            `admin.pdfImport.problems.${current.reason}` as 'admin.pdfImport.problems.unknownFormat',
          ),
        });
      case 'parseCrashed':
        return t('admin.pdfImport.parseFailed', { message: current.error });
      case 'importFailed':
        return t('errors.saveFailed', {
          message: isKnownErrorKey(current.error)
            ? t(`errors.${current.error}` as 'errors.tooManyEntries')
            : current.error,
        });
    }
  }

  const statusText = status ? statusMessage(status) : undefined;

  return (
    <>
      <Typography variant="h6" gutterBottom>
        {t('admin.pdfImport.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin.pdfImport.hint', { group: groupName })}
      </Typography>
      {statusText && (
        <Alert
          severity={status?.kind === 'imported' ? 'info' : 'error'}
          sx={{ mb: 2 }}
        >
          {statusText}
        </Alert>
      )}

      {/* `useFlexGap`, damit die Zeile beim Umbruch auf schmalen Geräten
          ihren Abstand behält — `Stack` setzt sonst nur linke Ränder. */}
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <Button component="label" variant="outlined" disabled={busy}>
          {t('admin.pdfImport.chooseFile')}
          <input
            hidden
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Auswahl zurücksetzen, sonst löst dieselbe Datei nach einem
              // Fehlversuch kein zweites `change` aus.
              e.target.value = '';
              if (file) chooseFile(file);
            }}
          />
        </Button>
        <TextField
          select
          size="small"
          label={t('vehicle')}
          value={vehicleId}
          onChange={(e) => chooseVehicle(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          {activeVehicles.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.name}
            </MenuItem>
          ))}
        </TextField>
        {/* Nur nötig, wenn das Fahrzeug mehr als eine Kraftstoffart führt —
            die Quelle nennt in der Spalte „Treibstoff" keine. */}
        {(vehicle?.fuelTypes ?? []).filter((f) => f !== 'adblue').length > 1 && (
          <TextField
            select
            size="small"
            label={t('admin.pdfImport.fuelColumn')}
            value={fuelType}
            onChange={(e) => setFuelType(e.target.value as FuelType)}
            sx={{ minWidth: 180 }}
          >
            {FUEL_TYPES.filter(
              (f) => f !== 'adblue' && (vehicle?.fuelTypes ?? []).includes(f),
            ).map((f) => (
              <MenuItem key={f} value={f}>
                {t(`fuel.${f}` as 'fuel.diesel')}
              </MenuItem>
            ))}
          </TextField>
        )}
        {/* Die Aktionen rücken nach rechts, brechen auf schmalen Geräten aber
            mit um. */}
        <Stack direction="row" spacing={2} sx={{ ml: 'auto' }}>
          {(parsed || status) && (
            <Button onClick={reset} disabled={busy}>
              {t('admin.pdfImport.reset')}
            </Button>
          )}
          <Button
            variant="contained"
            onClick={run}
            disabled={busy || !vehicle || effectiveSelection.size === 0}
          >
            {t('admin.pdfImport.run')}
          </Button>
        </Stack>
      </Stack>

      {busy && <LinearProgress sx={{ mb: 2 }} />}
      {parsed && !vehicle && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('admin.pdfImport.chooseVehicle', {
            title: [parsed.vehicleName, parsed.kennzeichen]
              .filter(Boolean)
              .join(' '),
          })}
        </Alert>
      )}

      {rows.length > 0 && (
        <>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t('admin.pdfImport.summary', {
              total: rows.length,
              ready: rows.filter((r) => r.state === 'ready').length,
              duplicates: rows.filter((r) => r.state === 'duplicate').length,
              problems: rows.filter((r) => r.state === 'problem').length,
              unknownDrivers: rows.filter((r) => r.state === 'unknownDriver')
                .length,
            })}
          </Typography>
          {/* Nicht verschweigen, dass der Import Stammdaten anlegt — und
              welche. Wer den Namen hier liest, kann ihn vorher korrigieren. */}
          {newDriverNames.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('admin.pdfImport.unknownDriverNotice', {
                names: newDriverNames.join(', '),
              })}
            </Alert>
          )}
          {/* Acht Spalten passen auf einem Telefon nicht nebeneinander — die
              Tabelle scrollt in ihrem eigenen Kasten, damit nicht die ganze
              Seite waagrecht wandert. */}
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>{t('admin.pdfImport.date')}</TableCell>
                  <TableCell>{t('admin.pdfImport.time')}</TableCell>
                  <TableCell>{t('driver')}</TableCell>
                  <TableCell>{t('zweck')}</TableCell>
                  <TableCell>{t('ziel')}</TableCell>
                  <TableCell>{t('admin.pdfImport.km')}</TableCell>
                  <TableCell>{t('admin.pdfImport.state')}</TableCell>
                  <TableCell padding="checkbox" />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        slotProps={{
                          input: {
                            'aria-label': `${row.preview.datum} ${row.values.driverName}`,
                          },
                        }}
                        disabled={busy || !row.input}
                        checked={effectiveSelection.has(row.line) && !!row.input}
                        onChange={(e) =>
                          setSelected((current) => {
                            const next = new Set(current ?? autoLines);
                            if (e.target.checked) next.add(row.line);
                            else next.delete(row.line);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>{row.preview.datum}</TableCell>
                    <TableCell>{row.preview.zeit}</TableCell>
                    <TableCell>
                      {row.values.driverName}
                      {/* Nur an der ausgewählten Zeile: Eine abgewählte legt
                          keine Person an, und der Hinweis wäre dort falsch. */}
                      {row.state === 'unknownDriver' &&
                        effectiveSelection.has(row.line) && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block' }}
                          >
                            {t('admin.pdfImport.driverWillBeCreated')}
                          </Typography>
                        )}
                    </TableCell>
                    <TableCell>
                      {t(`zwecke.${row.values.zweck}` as 'zwecke.einsatz')}
                    </TableCell>
                    <TableCell>
                      {row.values.ziel}
                      {row.state === 'problem' && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          {row.raw}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.preview.km}</TableCell>
                    <TableCell>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        useFlexGap
                        sx={{ flexWrap: 'wrap' }}
                      >
                        <Chip
                          size="small"
                          color={row.state === 'ready' ? 'success' : 'default'}
                          label={
                            row.state === 'problem' && row.problem
                              ? t(
                                  `admin.pdfImport.problems.${row.problem}` as 'admin.pdfImport.problems.kmMismatch',
                                )
                              : t(
                                  `admin.pdfImport.states.${row.state}` as 'admin.pdfImport.states.ready',
                                )
                          }
                        />
                        {row.edited && (
                          <Chip
                            size="small"
                            color="info"
                            label={t('admin.pdfImport.edited')}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell padding="checkbox">
                      <IconButton
                        size="small"
                        aria-label={t('admin.pdfImport.editRow', {
                          line: row.line,
                        })}
                        disabled={busy}
                        onClick={() => setEditingLine(row.line)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {editingRow && (
        <ImportRowEditDialog
          // Der Dialog übernimmt seine Felder beim Aufbau — ohne `key` zeigte
          // er beim Öffnen der nächsten Zeile noch die Werte der vorigen.
          key={editingRow.line}
          row={editingRow}
          persons={persons}
          onSave={(edit) => saveEdit(editingRow.line, edit)}
          onClose={() => setEditingLine(undefined)}
          onDiscard={
            editingRow.edited ? () => discardEdit(editingRow.line) : undefined
          }
        />
      )}
    </>
  );
}
