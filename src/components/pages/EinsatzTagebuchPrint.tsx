import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useFirecallId } from '../../hooks/useFirecall';
import { useDiaries, useGridColumns } from './EinsatzTagebuch';

export interface EinsatzTagebuchOptions {
  boxHeight?: string;
}
export default function EinsatzTagebuchPrint({
  boxHeight = '600px',
}: EinsatzTagebuchOptions) {
  const { diaries } = useDiaries();

  return (
    <>
      <Box sx={{ p: 2, m: 2, height: boxHeight }}>
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
            {diaries.map((item) => (
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
