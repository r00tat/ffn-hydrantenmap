'use client';

import Container from '@mui/material/Container';
import KostenersatzAdminSettings from '../../../components/Kostenersatz/KostenersatzAdminSettings';
import AdminGuard from '../../../components/site/AdminGuard';

export default function KostenersatzAdminPage() {
  return (
    <AdminGuard>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <KostenersatzAdminSettings />
      </Container>
    </AdminGuard>
  );
}
