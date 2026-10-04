import type { NextPage } from 'next';
import GeraeteAdminPage from '../../components/Geraete/admin/GeraeteAdminPage';

/**
 * Lagerseite „Geräte & Material": Artikel, Bestand je Lagerort,
 * Nachzubestellen, Pflege und Sybos-Import. Einsatzunabhängig — die Zuordnung
 * im Einsatz ist der Abschnitt `geraete` der Einsatzseite.
 */
const Geraete: NextPage = () => {
  return <GeraeteAdminPage />;
};

export default Geraete;
