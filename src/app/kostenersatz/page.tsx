'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import KostenersatzAccess from '../../components/Kostenersatz/KostenersatzAccess';
import KostenersatzList from '../../components/Kostenersatz/KostenersatzList';

export default function KostenersatzPage() {
  const t = useTranslations('kostenersatz');
  const firecall = useFirecall();
  const firecallId = useFirecallId();

  return (
    <KostenersatzAccess firecall={firecall} firecallId={firecallId} title={t('title')}>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h4" gutterBottom>
          {t('titleForCall', { name: firecall.name })}
        </Typography>
        <KostenersatzList firecallId={firecallId} />
      </Box>
    </KostenersatzAccess>
  );
}
