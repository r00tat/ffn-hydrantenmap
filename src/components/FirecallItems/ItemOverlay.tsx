import { useCallback } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemDialog from './FirecallItemDialog';

export interface ItemOverlayOptions {
  item: FirecallItem;
  close: () => void;
}

export default function ItemOverlay({ item, close }: ItemOverlayOptions) {
  const updateItem = useFirecallItemUpdate();

  const onClose = useCallback(
    (item?: FirecallItem) => {
      if (item) {
        updateItem(item);
      }
      close();
    },
    [close, updateItem]
  );

  return (
    <>
      <FirecallItemDialog onClose={onClose} item={item.original || item} />
      {/* <FirecallItemCard item={item} close={close} /> */}
    </>
  );
}
