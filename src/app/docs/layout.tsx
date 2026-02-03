import Box from '@mui/material/Box';
import { ReactNode } from 'react';
import DocsSidebar from '../../components/docs/DocsSidebar';
import DocsContent from '../../components/docs/DocsContent';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 3, p: 2, minHeight: '100vh' }}>
      <DocsSidebar />
      <DocsContent>{children}</DocsContent>
    </Box>
  );
}
