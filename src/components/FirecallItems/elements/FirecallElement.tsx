import React from 'react';
import { getItemInstance } from '.';
import { FirecallItem } from '../../firebase/firestore';

export default function FirecallElement({
  item,
  selectItem,
}: {
  item: FirecallItem;
  selectItem: (item: FirecallItem) => void;
}) {
  return (
    <React.Fragment>
      {getItemInstance(item).renderMarker(selectItem)}
    </React.Fragment>
  );
}
