'use client';

import Map from './Map';
import { PositionProvider } from '../providers/PositionProvider';

export default function PositionedMap() {
  return (
    <PositionProvider>
      <Map />
    </PositionProvider>
  );
}
