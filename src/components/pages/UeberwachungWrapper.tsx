'use client';

import UeberwachungPage from '../Atemschutz/UeberwachungPage';

/**
 * Wrapper für die Section-Registry — wie `AtemschutzWrapper`: Die Registry lädt
 * Komponenten ohne Props, der aktive Einsatz kommt aus dem Context.
 */
export default function UeberwachungWrapper() {
  return <UeberwachungPage />;
}
