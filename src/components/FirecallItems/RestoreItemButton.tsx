'use client';

import RestoreIcon from '@mui/icons-material/Restore';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useCallback, useState } from 'react';
import useFirecallItemRestore from '../../hooks/useFirecallItemRestore';
import useMapEditor from '../../hooks/useMapEditor';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import { useSnackbar } from '../providers/SnackbarProvider';

/**
 * Knopf „Wiederherstellen" im Popup eines Elements auf der Karte. Er erscheint
 * nur in einem Verlauf-Snapshot (der Stand des Snapshots ersetzt den aktuellen)
 * oder an einem gelöschten Element, und nur mit Schreibrecht am Einsatz.
 */
export default function RestoreItemButton({ item }: { item: FirecallItem }) {
  const { canWrite, historyModeActive, historyId } = useMapEditor();
  const restoreItem = useFirecallItemRestore();
  const showSnackbar = useSnackbar();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fromHistory = historyModeActive && item.deleted !== true;
  const name = item.name || 'Element';

  const restoreFn = useCallback(
    async (confirmed: boolean) => {
      setConfirmOpen(false);
      if (!confirmed) return;
      try {
        await restoreItem(item, {
          historyId: fromHistory ? historyId : undefined,
        });
        showSnackbar(`${name} wiederhergestellt`, 'success');
      } catch (err) {
        console.error('Failed to restore firecall item:', err);
        showSnackbar('Element konnte nicht wiederhergestellt werden.', 'error');
      }
    },
    [restoreItem, item, fromHistory, historyId, showSnackbar, name],
  );

  if (!canWrite || !item.id || (!historyModeActive && item.deleted !== true)) {
    return null;
  }

  return (
    <>
      <Tooltip title="Wiederherstellen">
        <IconButton
          size="small"
          color="primary"
          aria-label="Wiederherstellen"
          onClick={() => setConfirmOpen(true)}
        >
          <RestoreIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {confirmOpen && (
        <ConfirmDialog
          title={`${name} wiederherstellen`}
          text={
            fromHistory
              ? `${name} auf den Stand aus dem Verlauf zurücksetzen? Der aktuelle Stand des Elements wird überschrieben.`
              : `${name} wiederherstellen?`
          }
          onConfirm={restoreFn}
        />
      )}
    </>
  );
}
