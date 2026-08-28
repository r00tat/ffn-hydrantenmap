'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { BackupProgress } from '../../hooks/useExport';

/**
 * Beschreibt einen Fortschrittsstand in einem Satz — „Anhänge 12/40,
 * plan.pdf".
 *
 * Wie bei den Warnungen liefert `useExport` nur Codes und Zahlen; die Sprache
 * entsteht erst hier.
 */
export default function useBackupProgressText() {
  const t = useTranslations('backup');

  return useCallback(
    (progress: BackupProgress): string => {
      const phase = (() => {
        switch (progress.phase) {
          case 'structure':
            return t('progressStructure');
          case 'drawings':
            return t('progressDrawings');
          case 'history':
            return t('progressHistory');
          case 'attachments':
            return t('progressAttachments');
          case 'documents':
            return t('progressDocuments');
        }
      })();

      if (progress.total === 0) {
        return phase;
      }

      const counted = `${phase} ${progress.done}/${progress.total}`;
      return progress.label ? `${counted} — ${progress.label}` : counted;
    },
    [t]
  );
}

/** Prozentwert für die Balken, `undefined` solange die Gesamtzahl fehlt. */
export function backupProgressPercent(
  progress?: BackupProgress
): number | undefined {
  if (!progress || progress.total === 0) {
    return undefined;
  }
  return Math.min(100, (progress.done / progress.total) * 100);
}
