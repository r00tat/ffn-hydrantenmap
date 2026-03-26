'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
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
import { useState, useCallback, useMemo } from 'react';
import FileUpload from './FileUpload';
import ProgressStepper, { type StepStatus } from './ProgressStepper';
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

type StatusFilter = 'all' | 'new' | 'update';

export default function HydrantenCsvImport() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [status, setStatus] = useState<StepStatus>('pending');
  const [error, setError] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);

  const [parseMatchResult, setParseMatchResult] = useState<ParseAndMatchResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const resetAll = useCallback(() => {
    setCsvFile(null);
    setActiveStep(-1);
    setStatus('pending');
    setError(undefined);
    setIsRunning(false);
    setParseMatchResult(null);
    setImportResult(null);
    setStatusFilter('all');
  }, []);

  const startParsing = useCallback(async () => {
    if (!csvFile) return;
    setIsRunning(true);
    setError(undefined);

    try {
      // Steps 0-2: Parse + Convert + Match (all server-side)
      setActiveStep(0);
      setStatus('in_progress');

      const formData = new FormData();
      formData.append('csvFile', csvFile);
      const result = await parseAndMatchCsv(formData);
      setParseMatchResult(result);

      // Step 3: Preview
      setActiveStep(3);
      setStatus('pending');
      setIsRunning(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [csvFile]);

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

  const matches = parseMatchResult?.matches ?? [];

  const { newCount, updateCount, duplicateCount } = useMemo(() => ({
    newCount: matches.filter((r) => r.status === 'new').length,
    updateCount: matches.filter((r) => r.status === 'update').length,
    duplicateCount: matches.filter((r) => r.duplicateDocId).length,
  }), [matches]);

  const filteredResults = useMemo(() =>
    statusFilter === 'all'
      ? matches
      : matches.filter((r) => r.status === statusFilter),
    [matches, statusFilter]);

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
          label="CSV Datei auswählen"
          onFileSelect={setCsvFile}
          selectedFile={csvFile}
          disabled={isRunning}
        />
        <Box>
          <Button
            variant="contained"
            onClick={startParsing}
            disabled={!csvFile || isRunning}
          >
            CSV analysieren
          </Button>
        </Box>
      </Box>

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
            <ToggleButton value="all">Alle ({matches.length})</ToggleButton>
            <ToggleButton value="new">Neu ({newCount})</ToggleButton>
            <ToggleButton value="update">Update ({updateCount})</ToggleButton>
          </ToggleButtonGroup>

          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Ortschaft</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Hydranten-Nr.</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Typ</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Dimension</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Stat. Druck</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Dyn. Druck</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Duplikat</TableCell>
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
                    <TableCell>{result.dimension}</TableCell>
                    <TableCell>{result.statischer_druck}</TableCell>
                    <TableCell>{result.dynamischer_druck}</TableCell>
                    <TableCell>{result.duplicateDocId ?? '—'}</TableCell>
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
    </Paper>
  );
}
