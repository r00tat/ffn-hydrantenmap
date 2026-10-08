import type { NextPage } from 'next';
import BekleidungPage from '../../components/Bekleidung/BekleidungPage';

/**
 * Seite „Bekleidung": Einsatz- und Dienstbekleidung einer Gruppe — Stücke,
 * Lagerstand, Ausgabe, Rücknahme, Wäsche und Artikel. Nur für
 * Bekleidungswart, Gruppen-Admin und Admin (siehe docs/bekleidung.md).
 */
const Bekleidung: NextPage = () => {
  return <BekleidungPage />;
};

export default Bekleidung;
