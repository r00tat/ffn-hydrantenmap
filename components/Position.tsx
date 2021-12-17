import React, { useState, useContext, createContext } from 'react';
import usePosition, {
  defaultPosition,
  PositionInfo,
} from '../hooks/usePosition';
import L from 'leaflet';

const PositionContext = createContext<PositionInfo>([
  defaultPosition,
  false,
  undefined,
]);

export default function Position({ children }: { children: React.ReactNode }) {
  const positionInfo = usePosition();
  return (
    <PositionContext.Provider value={positionInfo}>
      {children}
    </PositionContext.Provider>
  );
}

export const usePositionContext = (): PositionInfo => {
  return useContext(PositionContext);
};
