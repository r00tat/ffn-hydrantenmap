import { useState } from 'react';
import FirecallItemDialog from './FirecallItemDialog';
import { FirecallItem, Fzg } from './firestore';

export interface FzgDialogOptions {
  onClose: (fzg?: Fzg) => void;
  item?: Fzg;
}

export default function FzgDialog({
  onClose,
  item: vehicle,
}: FzgDialogOptions) {
  const [fzg, setFzg] = useState<Fzg>(
    vehicle || {
      type: 'vehicle',
      alarmierung: new Date().toLocaleString('de-DE'),
      eintreffen: new Date().toLocaleString('de-DE'),
    }
  );

  return (
    <FirecallItemDialog
      onClose={(fzg?: FirecallItem) => onClose(fzg as Fzg)}
      item={fzg}
    />
  );
}
