'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ReactNode } from 'react';
import AdminGuard from '../../components/site/AdminGuard';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <Box sx={{ margin: 2 }}>
        <Typography variant="h3" sx={{ mb: 2 }}>
          Admin
        </Typography>
        {children}
      </Box>
    </AdminGuard>
  );
}
