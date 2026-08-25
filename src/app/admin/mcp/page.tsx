'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import AdminMcpOverview from '../../../components/mcp/AdminMcpOverview';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';

export default function AdminMcpPage() {
  const t = useTranslations('adminMcp');
  const tAuth = useTranslations('auth');
  const { isAdmin, isAuthLoading } = useFirebaseLogin();

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h3" gutterBottom>
        {t('pageTitle')}
      </Typography>
      {/* Die Server Actions prüfen `actionAdminRequired` selbst — diese
          Schranke ist nur die Anzeige, nicht der Schutz. */}
      {!isAuthLoading && !isAdmin ? (
        <Alert severity="error">{tAuth('adminRequired')}</Alert>
      ) : (
        <AdminMcpOverview />
      )}
    </Box>
  );
}
