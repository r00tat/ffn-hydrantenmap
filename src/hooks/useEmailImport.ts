'use client';

import { useCallback, useState } from 'react';
import {
  processUnwetterEmails,
  EmailImportResult,
} from '../components/Einsatzorte/emailImportAction';

export interface UseEmailImportResult {
  importFromEmail: () => Promise<EmailImportResult | null>;
  isImporting: boolean;
  lastResult: EmailImportResult | null;
  clearResult: () => void;
}

export default function useEmailImport(
  firecallId: string | undefined
): UseEmailImportResult {
  const [isImporting, setIsImporting] = useState(false);
  const [lastResult, setLastResult] = useState<EmailImportResult | null>(null);

  const importFromEmail = useCallback(async (): Promise<EmailImportResult | null> => {
    if (!firecallId) {
      return null;
    }

    setIsImporting(true);
    try {
      const result = await processUnwetterEmails(firecallId);
      setLastResult(result);
      return result;
    } finally {
      setIsImporting(false);
    }
  }, [firecallId]);

  const clearResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return {
    importFromEmail,
    isImporting,
    lastResult,
    clearResult,
  };
}
