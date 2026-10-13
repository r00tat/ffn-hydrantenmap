'use client';

import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import useFirecall, { useFirecallId } from '../../../../../hooks/useFirecall';
import { useKostenersatzCalculation } from '../../../../../hooks/useKostenersatz';
import { useCan } from '../../../../../hooks/usePermissions';
import KostenersatzAccess from '../../../../../components/Kostenersatz/KostenersatzAccess';
import KostenersatzCalculationPage from '../../../../../components/Kostenersatz/KostenersatzCalculationPage';

export default function KostenersatzEditPage() {
  const params = useParams();
  const calculationId = params?.calculationId as string;
  const t = useTranslations('kostenersatz');
  const firecall = useFirecall();
  const firecallId = useFirecallId();
  // Ohne Recht nicht abonnieren — die Firestore-Regeln lehnten das Abo ab.
  const permitted = useCan(firecall.group, 'kostenersatz.use');
  const { calculation, loading, error } = useKostenersatzCalculation(
    permitted ? firecallId : undefined,
    calculationId,
  );

  return (
    <KostenersatzAccess firecall={firecall} firecallId={firecallId} title={t('title')}>
      <CalculationContent
        loading={loading}
        error={error}
        calculation={calculation}
        firecall={firecall}
        firecallId={firecallId}
      />
    </KostenersatzAccess>
  );
}

function CalculationContent({
  loading,
  error,
  calculation,
  firecall,
  firecallId,
}: {
  loading: boolean;
  error: Error | null;
  calculation: ReturnType<typeof useKostenersatzCalculation>['calculation'];
  firecall: ReturnType<typeof useFirecall>;
  firecallId: string;
}) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          Fehler
        </Typography>
        <Typography color="error">
          Fehler beim Laden der Berechnung: {error.message}
        </Typography>
      </Container>
    );
  }

  if (!calculation) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          Nicht gefunden
        </Typography>
        <Typography>Die angeforderte Berechnung wurde nicht gefunden.</Typography>
      </Container>
    );
  }

  return (
    <KostenersatzCalculationPage
      firecall={firecall}
      firecallId={firecallId}
      existingCalculation={calculation}
    />
  );
}
