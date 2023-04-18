import { useCallback } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import { firecallItems } from './infos/firecallitems';
import { FirecallItemInfo } from './infos/types';

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

  const itemInfo: FirecallItemInfo =
    firecallItems[item.type] || firecallItems.fallback;

  const deleteFn = useCallback(
    (result: boolean) => {
      if (result) {
        updateItem({ ...item, deleted: true });
      }
      if (callback) {
        callback(result);
      }
    },
    [callback, updateItem, item]
  );

  return (
    <ConfirmDialog
      title={`${itemInfo.name} ${itemInfo.title(item)} löschen`}
      text={`Element ${itemInfo.name} ${itemInfo.title(
        item
      )} wirklich löschen?`}
      onConfirm={deleteFn}
    />
  );
}
