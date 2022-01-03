import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { doc, orderBy, setDoc, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { filterActiveItems, Fzg } from '../components/firestore';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { useFirecall } from '../hooks/useFirecall';
import ConfirmDialog from './ConfirmDialog';
import { firestore } from './firebase';
import FzgDialog from './FzgDialog';

function useVehicleUpdate(firecallId: string = 'unknown') {
  const { email } = useFirebaseLogin();
  return useCallback(
    async (vehicle: Fzg) => {
      console.info(
        `update of vehicle ${vehicle.id}: ${JSON.stringify(vehicle)}`
      );
      await setDoc(
        doc(firestore, 'call', firecallId, 'item', '' + vehicle.id),
        { ...vehicle, updatedAt: new Date(), updatedBy: email },
        { merge: true }
      );
    },
    [email, firecallId]
  );
}

function VehicleCard({
  vehicle,
  firecallId,
}: {
  vehicle: Fzg;
  firecallId?: string;
}) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateVehicle = useVehicleUpdate(firecallId);

  const updateFn = useCallback(
    (fzg?: Fzg) => {
      setDisplayUpdateDialog(false);
      if (fzg) {
        updateVehicle(fzg);
      }
    },
    [updateVehicle]
  );
  const deleteFn = useCallback(
    (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateVehicle({ ...vehicle, deleted: true });
      }
    },
    [updateVehicle, vehicle]
  );

  return (
    <Grid item xs={12} md={6} lg={4}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="div">
            {vehicle.name} {vehicle.fw}
          </Typography>
          <Typography sx={{ mb: 1.5 }} color="text.secondary">
            1:{vehicle.besatzung || 0} ATS: {vehicle.ats || 0}
          </Typography>
          <Typography variant="body2">
            {vehicle.alarmierung ? 'Alarmierung: ' + vehicle.alarmierung : ''}
            {vehicle.eintreffen ? ' Eintreffen: ' + vehicle.eintreffen : ''}
            {vehicle.abruecken ? ' Abrücken: ' + vehicle.abruecken : ''}
          </Typography>
        </CardContent>
        <CardActions>
          <Button size="small" onClick={() => setDisplayUpdateDialog(true)}>
            Bearbeiten
          </Button>
          <Button
            size="small"
            onClick={() => setIsConfirmOpen(true)}
            color="error"
          >
            Löschen
          </Button>
        </CardActions>
      </Card>
      {displayUpdateDialog && (
        <FzgDialog onClose={updateFn} vehicle={vehicle} />
      )}
      {isConfirmOpen && (
        <ConfirmDialog
          title={`Fahrzeug ${vehicle.name} ${vehicle.fw || ''} löschen`}
          text={`Fahrzeug ${vehicle.name} ${
            vehicle.fw || ''
          } wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </Grid>
  );
}

export default function Fahrzeuge() {
  const { isAuthorized } = useFirebaseLogin();
  // const columns = useGridColumns();
  const firecall = useFirecall();
  const vehicles = useFirebaseCollection<Fzg>({
    collectionName: 'call',
    pathSegments: [firecall?.id || 'unkown', 'item'],
    queryConstraints: [
      where('type', '==', 'vehicle'),
      // orderBy('fw'),
      // orderBy('name'),
      // where('deleted', '!=', false),
    ],
    filterFn: filterActiveItems,
  });

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        Fahrzeuge
      </Typography>
      <Grid container spacing={2}>
        {vehicles.map((fzg) => (
          <VehicleCard vehicle={fzg} key={fzg.id} firecallId={firecall?.id} />
        ))}
      </Grid>
    </Box>
  );
}
