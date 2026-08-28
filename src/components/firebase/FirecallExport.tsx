'use client';

import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  type BackupProgress,
  type BackupWarning,
  exportFirecall,
} from '../../hooks/useExport';
import { useSnackbar } from '../providers/SnackbarProvider';
import { downloadBlob } from './download';
import useBackupProgressText, {
  backupProgressPercent,
} from './useBackupProgressText';
import useBackupWarningText from './useBackupWarningText';

export interface FirecallExportProps {
  firecallId: string;
}

export default function FirecallExport({ firecallId }: FirecallExportProps) {
  const t = useTranslations('backup');
  const showSnackbar = useSnackbar();
  const warningText = useBackupWarningText();
  const progressText = useBackupProgressText();
  const [progress, setProgress] = useState<BackupProgress>();

  const exportAndDownload = useCallback(async () => {
    const warnings: BackupWarning[] = [];
    try {
      const firecallData = await exportFirecall(firecallId, {
        onWarning: (warning) => warnings.push(warning),
        onProgress: setProgress,
      });
      const blob = new Blob([JSON.stringify(firecallData)], {
        type: 'application/json',
      });
      await downloadBlob(blob, `firecall-export-${firecallId}.json`);

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
      setProgress(undefined);
    }
  }, [firecallId, showSnackbar, t, warningText]);

  const inProgress = progress !== undefined;
  const percent = backupProgressPercent(progress);

  return (
    <Tooltip
      title={
        progress ? `${t('exporting')} ${progressText(progress)}` : t('exportTooltip')
      }
    >
      <span>
        <IconButton onClick={exportAndDownload} disabled={inProgress}>
          {progress ? (
            // Solange die Gesamtzahl fehlt, dreht der Kreis; danach füllt er sich.
            <CircularProgress
              size={24}
              variant={percent === undefined ? 'indeterminate' : 'determinate'}
              value={percent ?? 0}
            />
          ) : (
            <DownloadIcon />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
