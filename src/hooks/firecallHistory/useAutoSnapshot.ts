import { useCallback, useEffect, useRef } from 'react';
import { formatTimestamp } from '../../common/time-format';
import useFirecall, { useFirecallId } from '../useFirecall';
import useMapEditor from '../useMapEditor';
import { useSaveHistory } from './useSaveHistory';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  filterActiveItems,
} from '../../components/firebase/firestore';
import useFirebaseCollection from '../useFirebaseCollection';

const DEFAULT_INTERVAL_MINUTES = 5;

export interface ShouldCreateSnapshotParams {
  changesDetected: boolean;
  lastSnapshotTime: string | undefined;
  intervalMinutes: number;
  now: number;
}

export function shouldCreateSnapshot({
  changesDetected,
  lastSnapshotTime,
  intervalMinutes,
  now,
}: ShouldCreateSnapshotParams): boolean {
  if (intervalMinutes <= 0) return false;
  if (!changesDetected) return false;

  if (!lastSnapshotTime) return true;

  const elapsed = now - new Date(lastSnapshotTime).getTime();
  return elapsed >= intervalMinutes * 60 * 1000;
}

export default function useAutoSnapshot() {
  const firecall = useFirecall();
  const firecallId = useFirecallId();
  const { history, historyModeActive, historyPathSegments } = useMapEditor();
  const { saveHistory, saveInProgress } = useSaveHistory();

  const changesDetectedRef = useRef(false);
  const initialLoadRef = useRef(true);
  const historyRef = useRef(history);
  const saveInProgressRef = useRef(saveInProgress);
  const saveHistoryRef = useRef(saveHistory);
  useEffect(() => {
    historyRef.current = history;
    saveInProgressRef.current = saveInProgress;
    saveHistoryRef.current = saveHistory;
  }, [history, saveInProgress, saveHistory]);

  const intervalMinutes =
    firecall.autoSnapshotInterval ?? DEFAULT_INTERVAL_MINUTES;

  // Listen to firecall items to detect changes
  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn: filterActiveItems,
  });

  // Track changes — skip initial load
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    changesDetectedRef.current = true;
  }, [firecallItems]);

  // Stable timer callback using refs to avoid timer resets
  const checkAndSave = useCallback(async () => {
    if (historyModeActive || saveInProgressRef.current) return;

    const lastSnapshotTime =
      historyRef.current.length > 0
        ? historyRef.current[0].createdAt
        : undefined;

    if (
      shouldCreateSnapshot({
        changesDetected: changesDetectedRef.current,
        lastSnapshotTime,
        intervalMinutes,
        now: Date.now(),
      })
    ) {
      changesDetectedRef.current = false;
      const timestamp = formatTimestamp(new Date());
      await saveHistoryRef.current(`Auto-Snapshot ${timestamp}`);
    }
  }, [historyModeActive, intervalMinutes]);

  useEffect(() => {
    if (intervalMinutes <= 0 || historyModeActive) return;

    const intervalMs = intervalMinutes * 60 * 1000;
    const timer = setInterval(checkAndSave, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMinutes, historyModeActive, checkAndSave]);
}
