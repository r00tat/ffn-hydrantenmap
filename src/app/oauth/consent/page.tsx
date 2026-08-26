import Box from '@mui/material/Box';
import { redirect } from 'next/navigation';
import ConsentForm from '../../../components/oauth/ConsentForm';
import { resolveAuthorizeRequest } from '../../../server/oauth/authorizeFlow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Der Consent-Bildschirm.
 *
 * Er zeigt nur an; geprüft und entschieden wird in `resolveAuthorizeRequest`.
 * Wird die Seite direkt aufgerufen und die Anfrage ist bereits entscheidbar
 * (Einwilligung liegt vor, Anmeldung fehlt, Parameter sind falsch), leitet sie
 * genauso weiter wie der `authorize`-Endpunkt selbst.
 */
export default async function OauthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }

  const outcome = await resolveAuthorizeRequest(params);

  if (outcome.kind === 'redirect' || outcome.kind === 'login') {
    redirect(outcome.url);
  }
  if (outcome.kind === 'error') {
    redirect(
      `/oauth/fehler?error=${encodeURIComponent(outcome.error)}&description=${encodeURIComponent(outcome.description)}`,
    );
  }

  const redirectHost = (() => {
    const uri = params.get('redirect_uri');
    try {
      return uri ? new URL(uri).host : '';
    } catch {
      return uri ?? '';
    }
  })();

  return (
    <Box sx={{ p: 2 }}>
      <ConsentForm
        query={outcome.query}
        clientId={outcome.client.client_id}
        clientName={outcome.client.client_name || outcome.client.client_id}
        clientUri={outcome.client.client_uri}
        scopes={outcome.scopes}
        redirectHost={redirectHost}
        isCimd={outcome.client.source === 'cimd'}
      />
    </Box>
  );
}
