import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Container from '@mui/material/Container';
import { getTranslations } from 'next-intl/server';
import {
  SHARE_LINK_VEHICLE_PARAM,
  resolveShareLinkVehicleId,
  type ShareLinkFormData,
} from '../../../../common/fahrtenbuchShare';
import ShareLinkEntryForm from '../../../../components/Fahrtenbuch/ShareLinkEntryForm';
import {
  resolveFahrtenbuchShareLink,
  type ResolvedShareLink,
} from '../../../../server/auth/resolveFahrtenbuchShareLink';
import { loadShareFormData } from '../../../../server/fahrtenbuchShare/loadShareFormData';

// Ein Share-Link zeigt immer den aktuellen Fahrzeugbestand und die aktuellen
// Zählerstände; ein statisch vorgerendertes Formular wäre nach der ersten Fahrt
// falsch.
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations('fahrtenbuchShare');

  // Zwei getrennte try-Blöcke: nur das Auflösen des Tokens darf pauschal als
  // „Link ungültig" enden — sonst wäre die Seite ein Orakel, das gültige von
  // ungültigen Tokens unterscheidbar macht. `resolveFahrtenbuchShareLink`
  // protokolliert den echten Grund bereits selbst.
  let link: ResolvedShareLink;
  try {
    link = await resolveFahrtenbuchShareLink(token);
  } catch {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="error">
          <AlertTitle>{t('invalidTitle')}</AlertTitle>
          {t('invalidText')}
        </Alert>
      </Container>
    );
  }

  // Ab hier steht fest, dass der Token gültig war — es gibt nichts mehr zu
  // verschleiern. Ein Firestore-Ausfall als „Link ungültig" zu melden, würde
  // den Gast mit einem völlig korrekten Link zur Gruppenverwaltung schicken.
  let data: ShareLinkFormData;
  try {
    data = await loadShareFormData(link.groupId);
  } catch (err) {
    console.error('fahrtenbuch share form data failed to load', err);
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="warning">
          <AlertTitle>{t('loadFailedTitle')}</AlertTitle>
          {t('loadFailedText')}
        </Alert>
      </Container>
    );
  }

  return (
    <ShareLinkEntryForm
      token={token}
      data={data}
      // Erst gegen die geladenen Fahrzeuge geprüft: ein Aufkleber überlebt das
      // Fahrzeug, und eine ID, die der Server beim Speichern ablehnen würde,
      // darf im Formular nicht vorbelegt stehen.
      vehicleId={resolveShareLinkVehicleId(
        query[SHARE_LINK_VEHICLE_PARAM],
        data.vehicles,
      )}
    />
  );
}
