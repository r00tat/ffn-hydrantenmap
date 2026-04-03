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

  // Timer to check and create snapshots
  const checkAndSave = useCallback(async () => {
    if (historyModeActive || saveInProgress) return;

    const lastSnapshotTime =
      history.length > 0 ? history[0].createdAt : undefined;

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
      await saveHistory(`Auto-Snapshot ${timestamp}`);
    }
  }, [history, historyModeActive, intervalMinutes, saveHistory, saveInProgress]);

  useEffect(() => {
    if (intervalMinutes <= 0 || historyModeActive) return;

    const intervalMs = intervalMinutes * 60 * 1000;
    const timer = setInterval(checkAndSave, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMinutes, historyModeActive, checkAndSave]);
}
