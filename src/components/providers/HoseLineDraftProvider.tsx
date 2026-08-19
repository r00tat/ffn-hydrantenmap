'use client';

import { ReactNode } from 'react';
import {
  HoseLineDraftContext,
  useHoseLineDraftValue,
} from '../../hooks/useHoseLineDraft';

export default function HoseLineDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useHoseLineDraftValue();
  return (
    <HoseLineDraftContext.Provider value={value}>
      {children}
    </HoseLineDraftContext.Provider>
  );
}
