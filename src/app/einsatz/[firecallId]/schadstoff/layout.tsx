import { ReactNode } from 'react';
import SchadstoffPage from '../../../../components/pages/Schadstoff';

export default function SchadstoffLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SchadstoffPage />
      {children}
    </>
  );
}
