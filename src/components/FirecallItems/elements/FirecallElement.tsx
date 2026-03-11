import L from 'leaflet';
import React from 'react';
import { getItemInstance } from '.';
import { FirecallItem } from '../../firebase/firestore';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';

export default function FirecallElement({
  item,
  selectItem,
  options,
}: {
  item: FirecallItem;
  selectItem: (item: FirecallItem) => void;
  options?: MarkerRenderOptions;
}) {
  return (
    <React.Fragment>
      {getItemInstance(item).renderMarker(selectItem, options)}
    </React.Fragment>
  );
}
