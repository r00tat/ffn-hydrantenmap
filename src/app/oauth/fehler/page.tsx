import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

/**
 * Fehlerseite des Authorization Servers.
 *
 * Hier landen die Fälle, in denen **nicht** zum Client weitergeleitet werden
 * darf: unbekannte `client_id`, nicht registrierte `redirect_uri`. Eine
 * Weiterleitung wäre dort eine offene Weiterleitung.
 */
export default async function OauthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; description?: string }>;
}) {
  const { error, description } = await searchParams;
  const t = await getTranslations('oauthConsent');

  return (
    <Box sx={{ p: 2, maxWidth: 640, mx: 'auto' }}>
      <Alert severity="error">
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <Typography variant="body2" gutterBottom>
          {description || t('errorFallback')}
        </Typography>
        {error && (
          <Typography variant="caption" color="text.secondary">
            {error}
          </Typography>
        )}
      </Alert>
      {/*
        Bewusst `href` statt `component={Link}`: Diese Seite ist eine Server
        Component, und ein `next/link` als Prop wäre eine Funktion über die
        Server-Client-Grenze — React lehnt das zur Laufzeit ab. Ein voller
        Seitenwechsel ist hier ohnehin richtig, weil der abgebrochene
        OAuth-Ablauf nichts hinterlassen soll.
      */}
      <Button href="/" sx={{ mt: 2 }}>
        {t('backToApp')}
      </Button>
    </Box>
  );
}
