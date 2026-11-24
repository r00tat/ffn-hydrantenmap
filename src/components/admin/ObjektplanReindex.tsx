'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import {
  listObjektDokumenteForReindex,
  reindexObjektDokumentAction,
  type ReindexCandidate,
} from '../Objektplan/risikoobjektActions';

/**
 * Alle Pläne der Risikoobjekte neu einlesen — nach einer Verbesserung der
 * Melder- oder Texterkennung. Nacheinander, je Plan ein Aufruf: ein Plan
 * kann 55 MB haben und die Texterkennung Minuten dauern, ein einzelner
 * Aufruf für alle liefe in das Zeitlimit des Dienstes.
 * Hintergrund: docs/objektplaene.md, „Neu einlesen".
 */
export default function ObjektplanReindex() {
  const [candidates, setCandidates] = useState<ReindexCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const stopRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setSummary('');
    try {
      setCandidates(await listObjektDokumenteForReindex());
    } finally {
      setLoading(false);
    }
  };

  const run = async (list: ReindexCandidate[]) => {
    stopRef.current = false;
    setLog([]);
    setSummary('');
    let ok = 0;
    let failed = 0;
    setProgress({ done: 0, total: list.length });
    for (const [i, c] of list.entries()) {
      if (stopRef.current) break;
      const label = `${c.objektName} – ${c.name}`;
      let line: string;
      try {
        const result = await reindexObjektDokumentAction(c.objektId, c.dokumentId);
        if (result.ok) {
          ok += 1;
          line = `${label}: ${result.melder} detectors${result.ocr ? ' (OCR)' : ''}`;
        } else {
          failed += 1;
          line = `${label}: failed (${result.error})`;
        }
      } catch (err) {
        failed += 1;
        line = `${label}: failed (${err instanceof Error ? err.message : String(err)})`;
      }
      setLog((prev) => [...prev, line]);
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    setSummary(`Done: ${ok} re-read, ${failed} failed.`);
  };

  const withoutMelder = candidates?.filter((c) => c.melder === 0) ?? [];
  const running = progress !== null;

  return (
    <Box>
      <Button onClick={() => void load()} variant="contained" disabled={loading || running}>
        Find plan documents
      </Button>{' '}
      <Typography component="span" variant="body2" color="text.secondary">
        Re-read plans of risk objects from storage (index and OCR), e.g. after an
        improvement of the detector recognition
      </Typography>
      {loading && <LinearProgress sx={{ mt: 1 }} />}
      {candidates && (
        <Box sx={{ ml: 2, mt: 1, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2">
            {candidates.length} PDFs, {withoutMelder.length} without detectors.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              disabled={running || withoutMelder.length === 0}
              onClick={() => void run(withoutMelder)}
            >
              Re-read {withoutMelder.length} without detectors
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={running || candidates.length === 0}
              onClick={() => void run(candidates)}
            >
              Re-read all {candidates.length}
            </Button>
            {running && (
              <Button size="small" color="error" onClick={() => (stopRef.current = true)}>
                Stop
              </Button>
            )}
          </Box>
          {progress && (
            <Box sx={{ mt: 1 }}>
              <LinearProgress
                variant="determinate"
                value={(progress.done / Math.max(progress.total, 1)) * 100}
              />
              <Typography variant="caption">
                {progress.done} / {progress.total}
              </Typography>
            </Box>
          )}
          {summary && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {summary}
            </Typography>
          )}
          {log.map((line, i) => (
            <Typography key={i} variant="body2" color="text.secondary">
              {line}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
