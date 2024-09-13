import Grid from '@mui/material/Grid';
import DynamicMap from '../Map/PositionedMap';
import EinsatzTagebuch from '../pages/EinsatzTagebuchPrint';
import DynamicFahrzeuge from '../pages/FahrzeugePrint';
import Geschaeftsbuch from '../pages/GeschaeftsbuchPrint';

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
