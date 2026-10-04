import Box from '@mui/material/Box';
import { ReactNode } from 'react';
import GeraeteSchadstoffLink from '../../components/Geraete/einsatz/GeraeteSchadstoffLink';

export default function SchadstoffLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Box sx={{ p: 2, m: 2 }}>
      <GeraeteSchadstoffLink />
      {children}
    </Box>
  );
}
