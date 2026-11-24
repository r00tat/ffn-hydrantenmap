'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import type { DriveSyncResult } from '../../server/objektplan/driveSyncRunner';
import {
  listObjektDokumenteForReindex,
  listRisikoObjekteWithDriveLink,
  reindexObjektDokumentAction,
  syncRisikoObjekteFromDrive,
  type ReindexCandidate,
} from '../Objektplan/risikoobjektActions';

/**
 * Objekte je Aufruf, die der Server gleichzeitig abgleicht. Der Abgleich
 * wartet meist auf Drive, Storage und die Texterkennung — das überlappt gut.
 * Mehr nicht, weil pdfjs jeden Plan beim Indizieren ganz im Speicher hält und
 * der Dienst nur 1 CPU und 1 GiB hat.
 */
const DRIVE_SYNC_PARALLEL = 3;

function describeSync(result: DriveSyncResult): string {
  switch (result.status) {
    case 'ok':
      return `${result.imported} imported, ${result.removed} removed, ${result.skipped} unchanged, ${result.failed} failed`;
    case 'nichtLesbar':
      return 'Drive folder not readable';
    case 'keinDriveLink':
      return 'no Drive link';
  }
}

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

  const load = async (clearSummary = true) => {
    setLoading(true);
    if (clearSummary) setSummary('');
    try {
      setCandidates(await listObjektDokumenteForReindex());
    } finally {
      setLoading(false);
    }
  };

  /**
   * Alle Objekte mit Drive-Link abgleichen — neue und geänderte Dateien
   * werden dabei geholt und indiziert (samt OCR), ohne jedes Objekt einzeln
   * zu öffnen. Danach steht die Liste zum Neu-Einlesen bereit.
   */
  const syncAll = async () => {
    stopRef.current = false;
    setLog([]);
    setSummary('');
    setCandidates(null);
    const objekte = await listRisikoObjekteWithDriveLink();
    let imported = 0;
    let removed = 0;
    let failed = 0;
    setProgress({ done: 0, total: objekte.length });
    // Blöcke statt Einzelaufrufe: Next.js schickt Server Actions eines
    // Clients nacheinander ab, gleichzeitig geht es nur im Server.
    for (let start = 0; start < objekte.length; start += DRIVE_SYNC_PARALLEL) {
      if (stopRef.current) break;
      const block = objekte.slice(start, start + DRIVE_SYNC_PARALLEL);
      let lines: string[];
      try {
        const entries = await syncRisikoObjekteFromDrive(block.map((o) => o.id));
        lines = block.map((o) => {
          const entry = entries.find((e) => e.id === o.id);
          if (!entry || 'error' in entry) {
            failed += 1;
            return `${o.name}: failed (${entry?.error ?? 'no result'})`;
          }
          const { result } = entry;
          if (result.status === 'ok') {
            imported += result.imported;
            removed += result.removed;
            failed += result.failed;
          } else if (result.status === 'nichtLesbar') {
            failed += 1;
          }
          return `${o.name}: ${describeSync(result)}`;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed += block.length;
        lines = block.map((o) => `${o.name}: failed (${message})`);
      }
      setLog((prev) => [...prev, ...lines]);
      setProgress({ done: Math.min(start + block.length, objekte.length), total: objekte.length });
    }
    setProgress(null);
    setSummary(`Drive sync done: ${imported} imported, ${removed} removed, ${failed} failed.`);
    await load(false);
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
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={() => void syncAll()} variant="contained" disabled={loading || running}>
          Sync all from Drive
        </Button>
        <Button onClick={() => void load()} variant="contained" disabled={loading || running}>
          Find plan documents
        </Button>
        <Typography component="span" variant="body2" color="text.secondary">
          Fetch and index the plans of all risk objects with a Drive link, or re-read
          stored plans (index and OCR), e.g. after an improvement of the detector
          recognition
        </Typography>
      </Box>
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
          </Box>
        </Box>
      )}
      {progress && (
        <Box sx={{ mt: 1 }}>
          <Button size="small" color="error" onClick={() => (stopRef.current = true)}>
            Stop
          </Button>
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
  );
}
