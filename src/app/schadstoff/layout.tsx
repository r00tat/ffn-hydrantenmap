import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ReactNode } from 'react';

export default function SchadstoffLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        Schadstoff
      </Typography>
      {children}
    </Box>
  );
}
