'use client';

import Box from '@mui/material/Box';
import { AdminTabs } from '../../components/admin';
import AdminGuard from '../../components/site/AdminGuard';

export default function AdminPage() {
  return (
    <AdminGuard>
      <Box margin={2}>
        <AdminTabs />
      </Box>
    </AdminGuard>
  );
}
