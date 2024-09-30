import Grid from '@mui/material/Grid2';
import DynamicMap from '../Map/PositionedMap';
import EinsatzTagebuch from '../pages/EinsatzTagebuch';
import DynamicFahrzeuge from '../pages/FahrzeugePrint';
import Geschaeftsbuch from '../pages/Geschaeftsbuch';

export default function PrintPage() {
  return (
    <>
      <Grid container>
        <Grid size={{ xs: 1 }}>&nbsp;</Grid>
        <Grid size={{ xs: 10 }}>
          <DynamicMap />
        </Grid>
        <Grid size={{ xs: 1 }}>&nbsp;</Grid>
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
