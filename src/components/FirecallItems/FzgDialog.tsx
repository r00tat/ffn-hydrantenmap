import { useState } from 'react';
import { useMap } from 'react-leaflet';
import FirecallItemDialog from './FirecallItemDialog';
import { FirecallItem, Fzg } from '../firebase/firestore';
import { vehicleItemInfo } from './infos/vehicle';

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
