import { useState } from 'react';
import { useMap } from 'react-leaflet';
import FirecallItemDialog from './FirecallItemDialog';
import { vehicleItemInfo } from './firecallitems';
import { FirecallItem, Fzg } from './firestore';

export interface FzgDialogOptions {
  onClose: (fzg?: Fzg) => void;
  item?: Fzg;
}

export default function FzgDialog({
  onClose,
  item: vehicle,
}: FzgDialogOptions) {
  const [fzg, setFzg] = useState<Fzg>(vehicle || vehicleItemInfo.factory());

  return (
    <FirecallItemDialog
      onClose={(fzg?: FirecallItem) => onClose(fzg as Fzg)}
      item={fzg}
    />
  );
}
