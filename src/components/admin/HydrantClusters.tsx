'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useState, useCallback } from 'react';
import ProgressStepper, { StepStatus } from './ProgressStepper';

interface ProgressEvent {
  step: number;
  status: 'in_progress' | 'completed' | 'error';
  message?: string;
  count?: number;
  error?: string;
}

const UPDATE_STEPS = [
  { label: 'Fetching existing clusters', description: 'Loading current cluster data from Firestore' },
  { label: 'Fetching collections', description: 'Loading hydrant, risikoobjekt, gefahrobjekt, loeschteich, saugstelle' },
  { label: 'Merging data', description: 'Combining records into geohash clusters' },
  { label: 'Writing to Firestore', description: 'Saving updated clusters' },
];

export default function HydrantClusters() {
  const [activeStep, setActiveStep] = useState(-1);
  const [status, setStatus] = useState<StepStatus>('pending');
  const [error, setError] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [clusterCount, setClusterCount] = useState<number | null>(null);

  const resetState = useCallback(() => {
    setActiveStep(-1);
    setStatus('pending');
    setError(undefined);
    setIsRunning(false);
    setClusterCount(null);
  }, []);

  const updateClusters = useCallback(async () => {
    setIsRunning(true);
    setActiveStep(0);
    setStatus('in_progress');
    setError(undefined);
    setClusterCount(null);

    try {
      const response = await fetch('/api/admin/update-clusters', {
        method: 'POST',
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

            if (event.status === 'completed') {
              setStatus('completed');
              if (event.count !== undefined) {
                setClusterCount(event.count);
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
  }, []);

  const showSuccess = activeStep === 3 && status === 'completed';

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Hydrant Clusters
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Update Clusters from Existing Data
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Rebuilds cluster data from all existing Firestore collections (hydrant, risikoobjekt,
          gefahrobjekt, loeschteich, saugstelle). Run this after importing new data via the
          GIS Data Pipeline.
        </Typography>
        <Button
          variant="contained"
          onClick={updateClusters}
          disabled={isRunning}
        >
          Update Clusters
        </Button>
      </Box>

      {activeStep >= 0 && (
        <Box sx={{ mb: 3 }}>
          <ProgressStepper
            steps={UPDATE_STEPS}
            activeStep={activeStep}
            status={status}
            error={error}
          />
        </Box>
      )}

      {showSuccess && (
        <Box sx={{ mt: 2 }}>
          <Typography color="success.main">
            Successfully updated {clusterCount} clusters
          </Typography>
          <Button variant="outlined" onClick={resetState} sx={{ mt: 2 }}>
            Run Again
          </Button>
        </Box>
      )}

      {status === 'error' && (
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={resetState}>
            Retry
          </Button>
        </Box>
      )}
    </Paper>
  );
}
