'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import EinsatzFahrtenbuch from './EinsatzFahrtenbuch';

/**
 * Wrapper für die Route `/einsatz/{id}/fahrtenbuch` — die Section-Registry lädt
 * Komponenten ohne Props, der aktive Einsatz kommt daher aus dem Context.
 */
export default function EinsatzFahrtenbuchSection() {
  const t = useTranslations('fahrtenbuch');
  const firecallId = useFirecallId();
  const firecall = useFirecall();

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        {t('einsatz.title')}
      </Typography>
      <EinsatzFahrtenbuch firecallId={firecallId} firecall={firecall} />
    </Container>
  );
}
