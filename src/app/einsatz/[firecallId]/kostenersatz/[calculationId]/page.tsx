'use client';

import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import useFirecall, { useFirecallId } from '../../../../../hooks/useFirecall';
import useFirebaseLogin from '../../../../../hooks/useFirebaseLogin';
import { useKostenersatzCalculation } from '../../../../../hooks/useKostenersatz';
import KostenersatzCalculationPage from '../../../../../components/Kostenersatz/KostenersatzCalculationPage';
import { KOSTENERSATZ_GROUP } from '../../../../../common/kostenersatz';

export default function KostenersatzEditPage() {
  const params = useParams();
  const calculationId = params?.calculationId as string;
  const { isAuthorized, groups } = useFirebaseLogin();
  const firecall = useFirecall();
  const firecallId = useFirecallId();
  const { calculation, loading, error } = useKostenersatzCalculation(firecallId, calculationId);

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>Bitte melden Sie sich an.</Typography>
      </Container>
    );
  }

  if (!groups?.includes(KOSTENERSATZ_GROUP)) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          Kostenersatz
        </Typography>
        <Typography>
          Sie haben keine Berechtigung für diese Funktion. Bitte kontaktieren
          Sie einen Administrator, um Zugang zur Gruppe &quot;Kostenersatz&quot;
          zu erhalten.
        </Typography>
      </Container>
    );
  }

  if (firecallId === 'unknown') {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          Kostenersatz bearbeiten
        </Typography>
        <Typography>Kein Einsatz ausgewählt.</Typography>
      </Container>
    );
  }

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
