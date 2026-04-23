'use client';

import React, { createContext, useContext } from 'react';
import { defaultPosition } from '../../hooks/constants';
import usePosition, { PositionInfo } from '../../hooks/usePosition';

export const PositionContext = createContext<PositionInfo>([
  defaultPosition,
  false,
  undefined,
  () => {},
  false,
]);

export function PositionProvider({ children }: { children: React.ReactNode }) {
  const positionInfo = usePosition();
  return (
    <PositionContext.Provider value={positionInfo}>
      {children}
    </PositionContext.Provider>
  );
}

export default PositionProvider;

export const usePositionContext = (): PositionInfo => {
  const ctx = useContext(PositionContext);
  if (!ctx) {
    throw new Error('usePositionContext must be used within a PositionProvider');
  }
  return ctx;
};
