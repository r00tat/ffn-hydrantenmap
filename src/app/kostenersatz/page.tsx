'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import KostenersatzList from '../../components/Kostenersatz/KostenersatzList';
import { KOSTENERSATZ_GROUP } from '../../common/kostenersatz';

export default function KostenersatzPage() {
  const { isAuthorized, groups } = useFirebaseLogin();
  const firecall = useFirecall();
  const firecallId = useFirecallId();

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
          Kostenersatz
        </Typography>
        <Typography>Kein Einsatz ausgewählt.</Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        Kostenersatz - {firecall.name}
      </Typography>
      <KostenersatzList firecallId={firecallId} />
    </Box>
  );
}
