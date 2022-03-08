import { useState } from 'react';
import FirecallItemDialog from './FirecallItemDialog';
import { FirecallItem, Rohr } from './firestore';

export interface RohrDialogOptions {
  onClose: (rohr?: Rohr) => void;
  item?: Rohr;
}

export default function RohrDialog({
  onClose,
  item: rohrDefault,
}: RohrDialogOptions) {
  const [rohr, setRohr] = useState<Rohr>(
    rohrDefault || {
      art: 'C',
      type: 'rohr',
    }
  );

  return (
    <FirecallItemDialog
      onClose={(item?: FirecallItem) => onClose(item as Rohr)}
      item={rohr}
    />
  );
}
