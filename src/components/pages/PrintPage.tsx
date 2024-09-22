import Grid from '@mui/material/Grid';
import DynamicMap from '../Map/PositionedMap';
import EinsatzTagebuch from '../pages/EinsatzTagebuch';
import DynamicFahrzeuge from '../pages/FahrzeugePrint';
import Geschaeftsbuch from '../pages/Geschaeftsbuch';

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
      <hr></hr>
      <DynamicFahrzeuge />
      <hr></hr>
      <EinsatzTagebuch showEditButton={false} sortAscending />
      <hr></hr>
      <Geschaeftsbuch showEditButton={false} sortAscending />
    </>
  );
}
