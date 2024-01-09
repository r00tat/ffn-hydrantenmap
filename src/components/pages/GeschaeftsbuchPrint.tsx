import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useGeschaeftsbuchEintraege } from './Geschaeftsbuch';
import { useMemo } from 'react';

export default function GeschaeftsbuchPrint() {
  const { eintraege } = useGeschaeftsbuchEintraege();

  const eintraegeSorted = useMemo(
    () => eintraege.sort((a, b) => (a.nummer || 0) - (b.nummer || 0)),
    [eintraege]
  );

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Geschäftsbuch
        </Typography>
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Ein/Ausgehend</th>
              <th>Von</th>
              <th>An</th>
              <th>Information</th>
              <th>Anmerkung</th>
            </tr>
          </thead>
          <tbody>
            {eintraegeSorted.map((item) => (
              <tr key={item.id}>
                <td>{item.nummer}</td>
                <td>{item.datum}</td>
                <td>{item.einaus}</td>
                <td>{item.von}</td>
                <td>{item.an}</td>
                <td>{item.name}</td>
                <td>{item.beschreibung}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </>
  );
}
