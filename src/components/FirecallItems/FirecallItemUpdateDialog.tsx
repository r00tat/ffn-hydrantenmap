import { useCallback, useState } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemDialog from './FirecallItemDialog';
import { firecallItems } from './infos/firecallitems';
import { FirecallItemInfo } from './infos/types';

export interface FirecallItemUpdateDialogOptions {
  item: FirecallItem;
  callback?: (item?: FirecallItem) => void;
  allowTypeChange?: boolean;
}

export default function FirecallItemUpdateDialog({
  item,
  callback,
  allowTypeChange,
}: FirecallItemUpdateDialogOptions) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const firecallId = useFirecallId();
  const updateItem = useFirecallItemUpdate(firecallId);

  const itemInfo: FirecallItemInfo =
    firecallItems[item.type] || firecallItems.fallback;

  const updateFn = useCallback(
    (fcItem?: FirecallItem) => {
      if (fcItem) {
        updateItem(fcItem);
      }
      if (callback) {
        callback(fcItem);
      }
    },
    [updateItem, callback]
  );
  const deleteFn = useCallback(
    (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateItem({ ...item, deleted: true });
      }
    },
    [updateItem, item]
  );

  return (
    <>
      <FirecallItemDialog
        onClose={updateFn}
        item={item.original || item}
        allowTypeChange={allowTypeChange}
      />

      {isConfirmOpen && (
        <ConfirmDialog
          title={`${itemInfo.name} ${itemInfo.title(item)} löschen`}
          text={`Element ${itemInfo.name} ${itemInfo.title(
            item
          )} wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </>
  );
}
