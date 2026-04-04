'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useDiaries } from './EinsatzTagebuch';
import { useMemo } from 'react';

export default function EinsatzTagebuchPrint() {
  const { diaries } = useDiaries(true);

  const diariesSorted = useMemo(
    () => [...diaries].sort((a, b) => (a.nummer || 0) - (b.nummer || 0)),
    [diaries]
  );

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h4" className="print-section">
          Einsatztagebuch
        </Typography>
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Nummer</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Datum</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Von</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>An</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Information</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Anmerkung</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Erledigt</th>
            </tr>
          </thead>
          <tbody>
            {diariesSorted.map((item) => (
              <tr key={item.id}>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.nummer}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.datum}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.von}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.an}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.name}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.beschreibung}</td>
                <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{item.erledigt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </>
  );
}
