import { useCallback, useState } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemDialog from './FirecallItemDialog';
import { FirecallItemInfo, firecallItems } from './firecallitems';

export interface FirecallItemUpdateDialogOptions {
  item: FirecallItem;
  callback?: (item?: FirecallItem) => void;
}

export default function FirecallItemUpdateDialog({
  item,
  callback,
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
      <FirecallItemDialog onClose={updateFn} item={item.original || item} />

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
