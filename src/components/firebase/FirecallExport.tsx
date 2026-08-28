'use client';

import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { type BackupWarning, exportFirecall } from '../../hooks/useExport';
import { useSnackbar } from '../providers/SnackbarProvider';
import { downloadBlob } from './download';
import useBackupWarningText from './useBackupWarningText';

export interface FirecallExportProps {
  firecallId: string;
}

export default function FirecallExport({ firecallId }: FirecallExportProps) {
  const t = useTranslations('backup');
  const showSnackbar = useSnackbar();
  const warningText = useBackupWarningText();
  const [exportInProgress, setExportInProgress] = useState(false);

  const exportAndDownload = useCallback(async () => {
    setExportInProgress(true);
    const warnings: BackupWarning[] = [];
    try {
      const firecallData = await exportFirecall(firecallId, (warning) =>
        warnings.push(warning)
      );
      const blob = new Blob([JSON.stringify(firecallData)], {
        type: 'application/json',
      });
      downloadBlob(blob, `firecall-export-${firecallId}.json`);

      // Eine Sicherung, in der Anhänge fehlen, sieht als Datei vollständig aus.
      // Deshalb wird jeder Fehlschlag angezeigt statt nur protokolliert.
      if (warnings.length > 0) {
        showSnackbar(
          `${t('warningsTitle', { count: warnings.length })}: ${warnings
            .map(warningText)
            .join(' ')}`,
          'warning'
        );
      }
    } catch (err) {
      console.error('firecall export failed', err);
      showSnackbar(t('exportFailed', { error: `${err}` }), 'error');
    } finally {
      setExportInProgress(false);
    }
  }, [firecallId, showSnackbar, t, warningText]);

  return (
    <Tooltip title={exportInProgress ? t('exporting') : t('exportTooltip')}>
      <span>
        <IconButton onClick={exportAndDownload} disabled={exportInProgress}>
          {exportInProgress ? (
            <CircularProgress size={24} />
          ) : (
            <DownloadIcon />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
