'use client';

import FuellprotokollPage from '../Atemschutz/FuellprotokollPage';

/**
 * Hülle für die Route. Anders als `AtemschutzWrapper` ohne Einsatzbezug —
 * diese Seite holt ihre Gruppe selbst.
 */
export default function FuellprotokollWrapper() {
  return <FuellprotokollPage />;
}
