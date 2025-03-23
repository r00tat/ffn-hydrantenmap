'use client';

import MapEditorProvider from '../providers/MapEditorProvider';
import Map from './Map';
import Position from './Position';

export default function PositionedMap() {
  return (
    <Position>
      <MapEditorProvider>
        <Map />
      </MapEditorProvider>
    </Position>
  );
}
