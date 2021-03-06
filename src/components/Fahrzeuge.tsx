import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { useFirecallId } from '../hooks/useFirecall';
import {
  filterActiveItems,
  FirecallItem,
  Fzg,
  Rohr,
} from './firebase/firestore';
import FirecallItemCard from './FirecallItems/FirecallItemCard';

export default function Fahrzeuge() {
  const { isAuthorized } = useFirebaseLogin();
  const firecallId = useFirecallId();
  // console.info(`firecall id ${firecallId}`);
  const [vehicles, setVehicles] = useState<Fzg[]>([]);
  const [rohre, setRohre] = useState<Rohr[]>([]);
  const [otherItems, setOtherItems] = useState<FirecallItem[]>([]);

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    pathSegments: [firecallId, 'item'],
    // queryConstraints: [where('type', '==', 'vehicle')],
    filterFn: filterActiveItems,
  });

  useEffect(() => {
    if (firecallItems) {
      setVehicles(
        firecallItems.filter((item) => item?.type === 'vehicle') as Fzg[]
      );
      setRohre(firecallItems.filter((item) => item?.type === 'rohr') as Rohr[]);
      setOtherItems(
        firecallItems.filter(
          (item) => item?.type !== 'rohr' && item.type !== 'vehicle'
        )
      );
    }
  }, [firecallItems]);

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
