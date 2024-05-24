import Grid from '@mui/material/Grid';
import DynamicMap from '../../components/Map/PositionedMap';
import EinsatzTagebuch from '../../components/pages/EinsatzTagebuchPrint';
import DynamicFahrzeuge from '../../components/pages/FahrzeugePrint';
import Geschaeftsbuch from '../../components/pages/GeschaeftsbuchPrint';

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
      <EinsatzTagebuch />
      <Geschaeftsbuch />
    </>
  );
}
