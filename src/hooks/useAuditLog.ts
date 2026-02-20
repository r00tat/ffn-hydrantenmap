'use client';

import { addDoc, collection, orderBy } from 'firebase/firestore';
import { useCallback, useMemo } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  AuditLogEntry,
  FIRECALL_AUDITLOG_COLLECTION_ID,
  FIRECALL_COLLECTION_ID,
} from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';
import useFirebaseCollection from './useFirebaseCollection';

type AuditLogInput = Omit<AuditLogEntry, 'id' | 'timestamp' | 'user'> & {
  firecallId?: string;
};

export function useAuditLog() {
  const contextFirecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const logChange = useCallback(
    (entry: AuditLogInput) => {
      const targetFirecallId = entry.firecallId || contextFirecallId;
      if (!targetFirecallId || targetFirecallId === 'unknown' || !email) return;

      const { firecallId: _, ...rest } = entry;
      const logEntry: Omit<AuditLogEntry, 'id'> = {
        ...rest,
        timestamp: new Date().toISOString(),
        user: email,
      };

      addDoc(
        collection(
          firestore,
          FIRECALL_COLLECTION_ID,
          targetFirecallId,
          FIRECALL_AUDITLOG_COLLECTION_ID
        ),
        logEntry
      ).catch((err) => console.error('Failed to write audit log:', err));
    },
    [contextFirecallId, email]
  );

  return logChange;
}

/**
 * Standalone audit log function for use outside React hooks (e.g. drag handlers).
 * Requires firecallId and user email to be passed explicitly.
 */
export function logAuditChange(
  firecallId: string,
  user: string,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'user'>
) {
  if (!firecallId || firecallId === 'unknown' || !user) return;

  addDoc(
    collection(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      FIRECALL_AUDITLOG_COLLECTION_ID
    ),
    {
      ...entry,
      timestamp: new Date().toISOString(),
      user,
    }
  ).catch((err) => console.error('Failed to write audit log:', err));
}

export function useAuditLogEntries(): AuditLogEntry[] {
  const firecallId = useFirecallId();

  const pathSegments = useMemo(
    () => [firecallId, FIRECALL_AUDITLOG_COLLECTION_ID],
    [firecallId]
  );

  const queryConstraints = useMemo(
    () => [orderBy('timestamp', 'desc')],
    []
  );

  return useFirebaseCollection<AuditLogEntry>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments,
    queryConstraints,
  });
}
