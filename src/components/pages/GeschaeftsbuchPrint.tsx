'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useGeschaeftsbuchEintraege } from './Geschaeftsbuch';

export default function GeschaeftsbuchPrint() {
  const t = useTranslations('print');
  const { eintraege } = useGeschaeftsbuchEintraege(true);

  const eintraegeSorted = useMemo(
    () => eintraege.sort((a, b) => (a.nummer || 0) - (b.nummer || 0)),
    [eintraege]
  );

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h4" className="print-section">
          {t('sectionGeschaeftsbuch')}
        </Typography>
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>{t('cols.number')}</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>{t('cols.date')}</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>{t('cols.inOut')}</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>{t('cols.from')}</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>{t('cols.to')}</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>{t('cols.info')}</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>{t('cols.comment')}</th>
            </tr>
          </thead>
          <tbody>
            {eintraegeSorted.map((item) => (
              <tr key={item.id}>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.nummer}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.datum}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.einaus}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.von}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.an}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.name}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.beschreibung}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </>
  );
}
