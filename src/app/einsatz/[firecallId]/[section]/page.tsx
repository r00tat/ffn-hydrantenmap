import { notFound } from 'next/navigation';
import { isFirecallSectionName } from '../../../../common/firecallNavigation';

/**
 * Abschnitt eines Einsatzes. Gerendert wird er wie die Karte von
 * `FirecallView` im Layout `einsatz/layout.tsx` nach der Adresse; ein Wechsel
 * per `FirecallLink` lädt die Seite deshalb nicht neu (siehe
 * `common/firecallNavigation.ts`). Die Seite prüft nur noch den Abschnitt.
 */
export default async function EinsatzSectionPage({
  params,
}: {
  params: Promise<{ firecallId: string; section: string }>;
}) {
  const { section } = await params;
  if (!isFirecallSectionName(section)) {
    notFound();
  }
  return null;
}
