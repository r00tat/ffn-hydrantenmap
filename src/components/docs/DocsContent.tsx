import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { ReactNode } from 'react';

interface DocsContentProps {
  children: ReactNode;
}

export default function DocsContent({ children }: DocsContentProps) {
  return (
    <Paper sx={{ p: 3, flexGrow: 1, minHeight: '80vh' }}>
      <Box sx={{ maxWidth: 900 }}>{children}</Box>
    </Paper>
  );
}
