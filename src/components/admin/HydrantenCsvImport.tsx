'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import MapIcon from '@mui/icons-material/Map';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useMemo } from 'react';
import FileUpload from './FileUpload';
import ProgressStepper, { type StepStatus } from './ProgressStepper';
import HydrantMapDialog from './HydrantMapDialog';
import CsvColumnMappingEditor, { type ColumnMapping } from './CsvColumnMappingEditor';
import {
  autoDetectMapping,
  TARGET_FIELDS,
} from '../../server/hydrantenCsvParser';
import {
  parseAndMatchCsv,
  importRecords,
  type ParseAndMatchResult,
  type ClientMatchResult,
  type ImportResult,
} from '../../app/admin/hydrantenCsvImportAction';

const STEPS = [
  { label: 'CSV parsen', description: 'Datei lesen, Felder mappen, Dezimalkomma konvertieren' },
  { label: 'Koordinaten konvertieren', description: 'GK M34 → WGS84, Geohash berechnen' },
  { label: 'Matching', description: 'Bestehende Hydranten laden und abgleichen' },
  { label: 'Vorschau', description: 'Änderungen prüfen vor dem Import' },
  { label: 'Import', description: 'Daten in Firestore schreiben' },
];

type StatusFilter = 'all' | 'new' | 'update' | 'duplicate';

/** Read CSV headers (first line) from a File */
async function readCsvHeaders(file: File): Promise<string[]> {
  const text = await file.text();
  const firstLine = text.split('\n')[0] ?? '';
  // Simple CSV header split — handles quoted headers
  const headers: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      headers.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) headers.push(current.trim());
  return headers;
}

export default function HydrantenCsvImport() {
  const t = useTranslations('admin.csvImport');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [activeStep, setActiveStep] = useState(-1);
  const [status, setStatus] = useState<StepStatus>('pending');
  const [error, setError] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);

  const [parseMatchResult, setParseMatchResult] = useState<ParseAndMatchResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [mapResult, setMapResult] = useState<ClientMatchResult | null>(null);

  const resetAll = useCallback(() => {
    setCsvFile(null);
    setCsvHeaders([]);
    setColumnMapping({});
    setActiveStep(-1);
    setStatus('pending');
    setError(undefined);
    setIsRunning(false);
    setParseMatchResult(null);
    setImportResult(null);
    setStatusFilter('all');
    setMapResult(null);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setCsvFile(file);
    setParseMatchResult(null);
    setActiveStep(-1);
    setStatus('pending');
    setError(undefined);

    // Read headers and auto-detect mapping
    const headers = await readCsvHeaders(file);
    setCsvHeaders(headers);
    setColumnMapping(autoDetectMapping(headers));
  }, []);

  const requiredFields = TARGET_FIELDS.filter((f) => f.required).map((f) => f.key);
  const assignedTargets = new Set(Object.values(columnMapping).filter(Boolean));
  const missingRequired = requiredFields.filter((f) => !assignedTargets.has(f));
  const canAnalyze = csvFile && missingRequired.length === 0 && !isRunning;

  const startParsing = useCallback(async () => {
    if (!csvFile) return;
    setIsRunning(true);
    setError(undefined);

    try {
      setActiveStep(0);
      setStatus('in_progress');

      const formData = new FormData();
      formData.append('csvFile', csvFile);
      formData.append('columnMapping', JSON.stringify(columnMapping));
      const result = await parseAndMatchCsv(formData);
      setParseMatchResult(result);

      setActiveStep(3);
      setStatus('pending');
      setIsRunning(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [csvFile, columnMapping]);

  const startImport = useCallback(async () => {
    if (!parseMatchResult) return;
    setIsRunning(true);
    setActiveStep(4);
    setStatus('in_progress');

    try {
      const result = await importRecords(parseMatchResult.sessionId);
      setImportResult(result);
      setStatus('completed');
      setIsRunning(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [parseMatchResult]);

  const matches = useMemo(() => parseMatchResult?.matches ?? [], [parseMatchResult]);

  const { newCount, updateCount, duplicateCount } = useMemo(() => ({
    newCount: matches.filter((r) => r.status === 'new').length,
    updateCount: matches.filter((r) => r.status === 'update').length,
    duplicateCount: matches.filter((r) => r.duplicateDocId).length,
  }), [matches]);

  const filteredResults = useMemo(() => {
    if (statusFilter === 'all') return matches;
    if (statusFilter === 'duplicate') return matches.filter((r) => r.duplicateDocId);
    return matches.filter((r) => r.status === statusFilter);
  }, [matches, statusFilter]);

  const showMapping = csvHeaders.length > 0 && !parseMatchResult;
  const showPreview = activeStep === 3 && status === 'pending' && matches.length > 0;
  const showSuccess = activeStep === 4 && status === 'completed' && importResult;

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Hydranten CSV Import
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        WLV CSV-Datei hochladen, um Hydranten zu aktualisieren oder neu anzulegen.
        Bestehende Felder wie Leistung bleiben erhalten. Duplikate werden automatisch bereinigt.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <FileUpload
          accept=".csv"
          label={t('selectFile')}
          onFileSelect={handleFileSelect}
          selectedFile={csvFile}
          disabled={isRunning}
        />
      </Box>

      {showMapping && (
        <Box sx={{ mb: 3 }}>
          <CsvColumnMappingEditor
            csvHeaders={csvHeaders}
            mapping={columnMapping}
            onMappingChange={setColumnMapping}
            disabled={isRunning}
          />
          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              onClick={startParsing}
              disabled={!canAnalyze}
            >
              CSV analysieren
            </Button>
          </Box>
        </Box>
      )}

      {activeStep >= 0 && (
        <Box sx={{ mb: 3 }}>
          <ProgressStepper
            steps={STEPS}
            activeStep={activeStep}
            status={status}
            error={error}
          />
        </Box>
      )}

      {parseMatchResult && activeStep >= 3 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">
            {parseMatchResult.totalParsed} Zeilen geparst, {parseMatchResult.totalConverted} mit gültigen Koordinaten
            {parseMatchResult.skippedInvalidCoords > 0 && ` (${parseMatchResult.skippedInvalidCoords} übersprungen)`}
          </Typography>
        </Box>
      )}

      {showPreview && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Vorschau
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
            <Chip label={`${newCount} Neu`} color="success" variant="outlined" />
            <Chip label={`${updateCount} Update`} color="info" variant="outlined" />
            {duplicateCount > 0 && (
              <Chip label={`${duplicateCount} Duplikate bereinigen`} color="warning" variant="outlined" />
            )}
          </Box>

          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            onChange={(_e, val) => val && setStatusFilter(val)}
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="all">{t('filter.all', { count: matches.length })}</ToggleButton>
            <ToggleButton value="new">{t('filter.new', { count: newCount })}</ToggleButton>
            <ToggleButton value="update">{t('filter.update', { count: updateCount })}</ToggleButton>
            {duplicateCount > 0 && (
              <ToggleButton value="duplicate">{t('filter.duplicate', { count: duplicateCount })}</ToggleButton>
            )}
          </ToggleButtonGroup>

          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.status')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.city')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.hydrantNo')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.type')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.dimension')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.staticPressure')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.dynamicPressure')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.duplicate')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('cols.map')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredResults.slice(0, 100).map((result) => (
                  <TableRow key={`${result.ortschaft}_${result.hydranten_nummer}`}>
                    <TableCell>
                      <Chip
                        label={result.status === 'new' ? 'Neu' : 'Update'}
                        color={result.status === 'new' ? 'success' : 'info'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{result.ortschaft}</TableCell>
                    <TableCell>{result.hydranten_nummer}</TableCell>
                    <TableCell>{result.typ}</TableCell>
                    <TableCell>{Number.isNaN(result.dimension) ? '—' : result.dimension}</TableCell>
                    <TableCell>{Number.isNaN(result.statischer_druck) ? '—' : result.statischer_druck}</TableCell>
                    <TableCell>{Number.isNaN(result.dynamischer_druck) ? '—' : result.dynamischer_druck}</TableCell>
                    <TableCell>{result.duplicateDocId ?? '—'}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setMapResult(result)}>
                        <MapIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {filteredResults.length > 100 && (
            <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
              Zeige 100 von {filteredResults.length} Einträgen
            </Typography>
          )}

          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button variant="outlined" onClick={resetAll}>
              Abbrechen
            </Button>
            <Button variant="contained" onClick={startImport}>
              Import starten ({matches.length} Hydranten)
            </Button>
          </Box>
        </Box>
      )}

      {showSuccess && (
        <Box sx={{ mt: 2 }}>
          <Typography color="success.main" variant="h6">
            Import erfolgreich
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {importResult.created} neu angelegt, {importResult.updated} aktualisiert
            {importResult.duplicatesDeleted > 0 && `, ${importResult.duplicatesDeleted} Duplikate bereinigt`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Bitte &quot;Update Clusters&quot; im Hydrant Clusters Tab ausführen, um die Cluster-Daten zu aktualisieren.
          </Typography>
          <Button variant="outlined" onClick={resetAll} sx={{ mt: 2 }}>
            Neuen Import starten
          </Button>
        </Box>
      )}

      {status === 'error' && (
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={resetAll}>
            Zurücksetzen
          </Button>
        </Box>
      )}
      <HydrantMapDialog
        open={mapResult !== null}
        onClose={() => setMapResult(null)}
        result={mapResult}
      />
    </Paper>
  );
}
