import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getTranslations } from 'next-intl/server';
import { ReactNode } from 'react';

export default async function SchadstoffLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('hazmatDb');
  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        {t('pageTitle')}
      </Typography>
      {children}
    </Box>
  );
}
