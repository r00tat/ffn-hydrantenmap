'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { ReactNode } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';

export default function AdminGuard({ children }: { children: ReactNode }) {
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

  return <>{children}</>;
}
