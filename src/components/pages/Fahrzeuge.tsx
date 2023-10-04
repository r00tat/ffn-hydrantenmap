import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import useVehicles from '../../hooks/useVehicles';
import FirecallItemCard from '../FirecallItems/FirecallItemCard';

export default function Fahrzeuge() {
  const { isAuthorized } = useFirebaseLogin();
  const firecallId = useFirecallId();
  const { vehicles, rohre, otherItems } = useVehicles();

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        {vehicles.length} Fahrzeuge im Einsatz
      </Typography>
      <Grid container spacing={2}>
        {vehicles.map((fzg) => (
          <FirecallItemCard item={fzg} key={fzg.id} firecallId={firecallId} />
        ))}
      </Grid>
      <Typography variant="h3" gutterBottom>
        {rohre.length} Rohre im Einsatz
      </Typography>
      <Grid container spacing={2}>
        {rohre.map((rohr) => (
          <FirecallItemCard item={rohr} key={rohr.id} firecallId={firecallId} />
        ))}
      </Grid>
      <Typography variant="h3" gutterBottom>
        {otherItems.length} weitere Einsatzmarker
      </Typography>
      <Grid container spacing={2}>
        {otherItems.map((item) => (
          <FirecallItemCard item={item} key={item.id} firecallId={firecallId} />
        ))}
      </Grid>
    </Box>
  );
}
