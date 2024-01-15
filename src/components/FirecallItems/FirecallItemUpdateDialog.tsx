import { useCallback, useMemo, useState } from 'react';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemDialog from './FirecallItemDialog';
import { getItemInstance } from './elements';

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
  const updateItem = useFirecallItemUpdate();
  const itemElement = useMemo(() => getItemInstance(item), [item]);

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
          title={`${itemElement.title()} löschen`}
          text={`${
            itemElement.markerName
          } ${itemElement.title()} wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </>
  );
}
