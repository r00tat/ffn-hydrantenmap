import Box from '@mui/material/Box';
import { ReactNode } from 'react';

export default function SchadstoffLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <Box sx={{ p: 2, m: 2 }}>{children}</Box>;
}
