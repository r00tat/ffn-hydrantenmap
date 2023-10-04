import Grid from '@mui/material/Grid';
import dynamic from 'next/dynamic';

const DynamicMap = dynamic(
  () => {
    return import('../components/Map/PositionedMap');
  },
  { ssr: false }
);

const DynamicFahrzeuge = dynamic(
  () => {
    return import('../components/pages/FahrzeugePrint');
  },
  { ssr: false }
);

const EinsatzTagebuch = dynamic(
  () => {
    return import('../components/pages/EinsatzTagebuchPrint');
  },
  { ssr: false }
);

export default function PrintPage() {
  return (
    <>
      <Grid container>
        <Grid item xs={1}>
          &nbsp;
        </Grid>
        <Grid item xs={10}>
          <DynamicMap />
        </Grid>
        <Grid item xs={1}>
          &nbsp;
        </Grid>
      </Grid>
      <DynamicFahrzeuge />
      <EinsatzTagebuch boxHeight="1200px" />
    </>
  );
}
