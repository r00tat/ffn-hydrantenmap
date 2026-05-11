'use client';

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import BugReportDialog from './BugReportDialog';

export interface BugReportContextValue {
  open: () => void;
}

const BugReportContext = createContext<BugReportContextValue>({
  open: () => {},
});

export function useBugReport(): BugReportContextValue {
  return useContext(BugReportContext);
}

export default function BugReportProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  const value = useMemo<BugReportContextValue>(() => ({ open }), [open]);

  return (
    <BugReportContext.Provider value={value}>
      {children}
      <BugReportDialog open={isOpen} onClose={handleClose} />
    </BugReportContext.Provider>
  );
}
