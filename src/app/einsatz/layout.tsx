import FirecallView from '../../components/pages/FirecallView';

/**
 * Karte und Abschnitte eines Einsatzes hängen hier, nicht in den Seiten.
 *
 * Zwischen ihnen wechselt die App per `history.pushState` (siehe
 * `common/firecallNavigation.ts`); der Router behält dabei den Baum der Seite,
 * mit der geladen wurde. Setzt danach eine Server Action Cookies — das
 * Auffrischen der Anmeldung beim Zurückkehren in die App und alle 30 Minuten
 * —, rendert Next.js den Baum der aktuellen Adresse neu. Hinge die Ansicht in
 * der Seite, wäre das ein anderes Segment und sie würde neu gemountet: offene
 * Dialoge und Eingaben wären weg. Dieses Layout hat keinen Parameter und
 * bleibt deshalb stehen, gleich welcher Einsatz oder Abschnitt gerade in der
 * Adresse steht. Seiten mit eigener Route (Kostenersatz, Schadstoff) kommen
 * über `children`; `FirecallView` rendert dort nichts.
 */
export default function EinsatzLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FirecallView />
      {children}
    </>
  );
}
