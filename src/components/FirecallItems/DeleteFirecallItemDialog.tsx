import { useCallback, useMemo } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import { getItemInstance } from './elements';

export interface DeleteFirecallItemDialogOptions {
  item: FirecallItem;
  callback?: (result: boolean) => void;
}

export default function DeleteFirecallItemDialog({
  item,
  callback,
}: DeleteFirecallItemDialogOptions) {
  const firecallId = useFirecallId();
  const updateItem = useFirecallItemUpdate(firecallId);

  const fcItem = useMemo(() => getItemInstance(item), [item]);

  const deleteFn = useCallback(
    (result: boolean) => {
      if (result) {
        updateItem({ ...fcItem.filteredData(), deleted: true });
      }
      if (callback) {
        callback(result);
      }
    },
    [callback, updateItem, fcItem]
  );

  return (
    <ConfirmDialog
      title={`${fcItem.title()} löschen`}
      text={`Element ${fcItem.title()} wirklich löschen?`}
      onConfirm={deleteFn}
    />
  );
}
