'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useDiaries } from './EinsatzTagebuch';
import { useMemo } from 'react';

export default function EinsatzTagebuchPrint() {
  const { diaries } = useDiaries(true);

  const diariesSorted = useMemo(
    () => diaries.sort((a, b) => (a.nummer || 0) - (b.nummer || 0)),
    [diaries]
  );

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Einsatz Tagebuch
        </Typography>
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Von</th>
              <th>An</th>
              <th>Information</th>
              <th>Anmerkung</th>
              <th>Erledigt</th>
            </tr>
          </thead>
          <tbody>
            {diariesSorted.map((item) => (
              <tr key={item.id}>
                <td>{item.nummer}</td>
                <td>{item.datum}</td>
                <td>{item.von}</td>
                <td>{item.an}</td>
                <td>{item.name}</td>
                <td>{item.beschreibung}</td>
                <td>{item.erledigt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </>
  );
}
