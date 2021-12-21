import React, { createContext, useContext } from 'react';
import usePosition, {
  defaultPosition,
  PositionInfo,
} from '../hooks/usePosition';

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
