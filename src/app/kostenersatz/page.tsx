'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import KostenersatzList from '../../components/Kostenersatz/KostenersatzList';
import { KOSTENERSATZ_GROUP } from '../../common/kostenersatz';

export default function KostenersatzPage() {
  const t = useTranslations('kostenersatz');
  const { isAuthorized, groups } = useFirebaseLogin();
  const firecall = useFirecall();
  const firecallId = useFirecallId();

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('loginRequired')}</Typography>
      </Container>
    );
  }

  if (!groups?.includes(KOSTENERSATZ_GROUP)) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          {t('title')}
        </Typography>
        <Typography>{t('noPermission')}</Typography>
      </Container>
    );
  }

  if (firecallId === 'unknown') {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          {t('title')}
        </Typography>
        <Typography>{t('noFirecall')}</Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        {t('titleForCall', { name: firecall.name })}
      </Typography>
      <KostenersatzList firecallId={firecallId} />
    </Box>
  );
}
