import { notFound } from 'next/navigation';
import { isFirecallSectionName } from '../../../../common/firecallNavigation';
import FirecallView from '../../../../components/pages/FirecallView';

/**
 * Abschnitt eines Einsatzes. Gerendert wird er wie die Karte von
 * `FirecallView` nach der Adresse; ein Wechsel per `FirecallLink` lädt die
 * Seite deshalb nicht neu (siehe `common/firecallNavigation.ts`).
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
  return <FirecallView />;
}
