'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import DiaryTable from './DiaryTable';
import { useDiaries } from './EinsatzTagebuch';

export default function EinsatzTagebuchPrint() {
  const t = useTranslations('print');
  const { diaries } = useDiaries(true);

  const diariesSorted = useMemo(
    () => [...diaries].sort((a, b) => (a.nummer || 0) - (b.nummer || 0)),
    [diaries]
  );

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h4" className="print-section">
          {t('sectionTagebuch')}
        </Typography>
        <DiaryTable diaries={diariesSorted} />
      </Box>
    </>
  );
}
