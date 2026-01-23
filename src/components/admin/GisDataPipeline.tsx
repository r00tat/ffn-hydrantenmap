'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useCallback } from 'react';
import FileUpload from './FileUpload';
import ProgressStepper, { StepStatus } from './ProgressStepper';
import DataPreview from './DataPreview';

interface ParsedRecord {
  name: string;
  lat: number;
  lng: number;
  ortschaft: string;
  [key: string]: unknown;
}

interface ProgressEvent {
  step: number;
  status: 'in_progress' | 'completed' | 'paused' | 'error';
  message?: string;
  count?: number;
  preview?: ParsedRecord[];
  data?: ParsedRecord[];
  total?: number;
  error?: string;
}

const STEPS = [
  { label: 'Parsing HAR', description: 'Reading and extracting GIS records from HAR file' },
  { label: 'Converting Coordinates', description: 'Transforming to WGS84 lat/lng' },
  { label: 'Preview', description: 'Review extracted data before import' },
  { label: 'Importing to Firestore', description: 'Writing records with merge to preserve existing fields' },
];

const PREVIEW_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'lat', label: 'Latitude' },
  { key: 'lng', label: 'Longitude' },
  { key: 'ortschaft', label: 'Ortschaft' },
];

export default function GisDataPipeline() {
  const [harFile, setHarFile] = useState<File | null>(null);
  const [ortschaft, setOrtschaft] = useState('ND');
  const [collectionName, setCollectionName] = useState('hydrant');
  const [activeStep, setActiveStep] = useState(-1);
  const [status, setStatus] = useState<StepStatus>('pending');
  const [error, setError] = useState<string | undefined>();
  const [previewData, setPreviewData] = useState<ParsedRecord[]>([]);
  const [fullData, setFullData] = useState<ParsedRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const resetPipeline = useCallback(() => {
    setActiveStep(-1);
    setStatus('pending');
    setError(undefined);
    setPreviewData([]);
    setFullData([]);
    setTotalRecords(0);
    setIsRunning(false);
    setImportedCount(null);
    setHarFile(null);
  }, []);

  const startPipeline = useCallback(async () => {
    if (!harFile) return;

    setIsRunning(true);
    setActiveStep(0);
    setStatus('in_progress');
    setError(undefined);
    setImportedCount(null);

    const formData = new FormData();
    formData.append('harFile', harFile);
    formData.append('ortschaft', ortschaft);
    formData.append('collectionName', collectionName);

    try {
      const response = await fetch('/api/admin/extract-import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: ProgressEvent = JSON.parse(line);
            setActiveStep(event.step);

            if (event.status === 'error') {
              setStatus('error');
              setError(event.error);
              setIsRunning(false);
              return;
            }

            if (event.status === 'paused' && event.preview) {
              setStatus('pending');
              setPreviewData(event.preview);
              setFullData(event.data || event.preview);
              setTotalRecords(event.total || event.preview.length);
              return; // Wait for user to continue
            }

            if (event.status === 'completed') {
              setStatus('completed');
              if (event.count !== undefined) {
                setImportedCount(event.count);
              }
            } else {
              setStatus('in_progress');
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      setIsRunning(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [harFile, ortschaft, collectionName]);

  const continueImport = useCallback(async () => {
    setIsRunning(true);
    setActiveStep(3);
    setStatus('in_progress');

    try {
      const response = await fetch('/api/admin/extract-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'continue',
          collectionName,
          data: fullData,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: ProgressEvent = JSON.parse(line);
            if (event.status === 'error') {
              setStatus('error');
              setError(event.error);
              setIsRunning(false);
              return;
            }
            if (event.status === 'completed' && event.count !== undefined) {
              setStatus('completed');
              setImportedCount(event.count);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      setIsRunning(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [collectionName, fullData]);

  const canStart = harFile && ortschaft && collectionName && !isRunning;
  const showPreview = activeStep === 2 && previewData.length > 0 && status === 'pending';
  const showSuccess = activeStep === 3 && status === 'completed' && importedCount !== null;

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        GIS Data Pipeline
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Import GIS data from HAR files captured from Burgenland GIS. The pipeline extracts records,
        converts coordinates to WGS84, and imports to Firestore with merge to preserve existing fields.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <FileUpload
          accept=".har"
          label="Select HAR File"
          onFileSelect={setHarFile}
          selectedFile={harFile}
          disabled={isRunning}
        />
        <TextField
          label="Ortschaft Prefix"
          value={ortschaft}
          onChange={(e) => setOrtschaft(e.target.value)}
          size="small"
          sx={{ maxWidth: 200 }}
          disabled={isRunning}
        />
        <TextField
          label="Collection Name"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          size="small"
          sx={{ maxWidth: 200 }}
          helperText="e.g., hydrant, risikoobjekt, gefahrobjekt"
          disabled={isRunning}
        />
        <Box>
          <Button
            variant="contained"
            onClick={startPipeline}
            disabled={!canStart}
          >
            Start Pipeline
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

      {showPreview && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Preview Data
          </Typography>
          <DataPreview
            data={previewData}
            columns={PREVIEW_COLUMNS}
            maxRows={20}
            total={totalRecords}
          />
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button variant="outlined" onClick={resetPipeline}>
              Cancel
            </Button>
            <Button variant="contained" onClick={continueImport}>
              Continue Import
            </Button>
          </Box>
        </Box>
      )}

      {showSuccess && (
        <Box sx={{ mt: 2 }}>
          <Typography color="success.main">
            Successfully imported {importedCount} records to {collectionName}
          </Typography>
          <Button variant="outlined" onClick={resetPipeline} sx={{ mt: 2 }}>
            Run Another
          </Button>
        </Box>
      )}

      {status === 'error' && (
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={resetPipeline}>
            Retry
          </Button>
        </Box>
      )}
    </Paper>
  );
}
