'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import KostenersatzAdminSettings from '../../../components/Kostenersatz/KostenersatzAdminSettings';
import Typography from '@mui/material/Typography';

export default function KostenersatzAdminPage() {
  const { isAdmin, isAuthorized } = useFirebaseLogin();

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>Bitte melden Sie sich an.</Typography>
      </Container>
    );
  }

  if (!isAdmin) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>
          Sie haben keine Berechtigung für diese Seite.
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <KostenersatzAdminSettings />
    </Container>
  );
}
