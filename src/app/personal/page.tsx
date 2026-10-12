import type { NextPage } from 'next';
import PersonalPage from '../../components/Personal/PersonalPage';

/**
 * Seite „Personal": der Personalstand einer Gruppe mit Qualifikationen,
 * BlaulichtSMS-ID und Benutzerkonten (siehe docs/personal.md).
 *
 * Bewusst nicht unter /admin: Das Layout dort lässt nur globale Admins durch,
 * gepflegt wird das Personal aber von Gruppen-Admins und Gerätemeistern.
 */
const Personal: NextPage = () => {
  return <PersonalPage />;
};

export default Personal;
