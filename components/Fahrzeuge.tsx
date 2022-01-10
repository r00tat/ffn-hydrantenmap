import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { where } from 'firebase/firestore';
import { filterActiveItems, Fzg, Rohr } from '../components/firestore';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { useFirecall } from '../hooks/useFirecall';
import FirecallItemCard from './FirecallItemCard';
import RohrCard from './RohrCard';

export default function Fahrzeuge() {
  const { isAuthorized } = useFirebaseLogin();
  const firecall = useFirecall();
  console.info(`firecall id ${firecall?.id}`);

  const vehicles = useFirebaseCollection<Fzg>({
    collectionName: 'call',
    pathSegments: [firecall?.id || 'unkown', 'item'],
    queryConstraints: [where('type', '==', 'vehicle')],
    filterFn: filterActiveItems,
  });
  const rohre = useFirebaseCollection<Rohr>({
    collectionName: 'call',
    pathSegments: [firecall?.id || 'unkown', 'item'],
    queryConstraints: [where('type', '==', 'rohr')],
    filterFn: filterActiveItems,
  });

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
          <FirecallItemCard item={fzg} key={fzg.id} firecallId={firecall?.id} />
        ))}
      </Grid>
      <Typography variant="h3" gutterBottom>
        {rohre.length} Rohre im Einsatz
      </Typography>
      <Grid container spacing={2}>
        {rohre.map((rohr) => (
          <FirecallItemCard
            item={rohr}
            key={rohr.id}
            firecallId={firecall?.id}
          />
        ))}
      </Grid>
    </Box>
  );
}
