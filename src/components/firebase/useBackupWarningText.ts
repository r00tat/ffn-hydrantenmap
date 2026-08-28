'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { BackupWarning } from '../../hooks/useExport';

/**
 * Übersetzt eine `BackupWarning` in einen anzeigbaren Satz.
 *
 * `useExport` liefert bewusst Codes statt fertiger Texte — dort steht kein
 * `useTranslations` zur Verfügung, und die Meldungen sollen in beiden Sprachen
 * herauskommen.
 */
export default function useBackupWarningText() {
  const t = useTranslations('backup');

  return useCallback(
    (warning: BackupWarning): string => {
      switch (warning.code) {
        case 'attachmentDownloadFailed':
          return t('warningAttachmentDownloadFailed', {
            file: warning.file ?? '',
          });
        case 'attachmentUploadFailed':
          return t('warningAttachmentUploadFailed', {
            file: warning.file ?? '',
          });
        case 'newerBackupVersion':
          return t('warningNewerBackupVersion');
      }
    },
    [t]
  );
}
