import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { Fzg } from '../components/firestore';
import useFirecallItemUpdate from '../hooks/useFirecallItemUpdate';
import ConfirmDialog from './ConfirmDialog';
import FzgDialog from './FzgDialog';

export default function VehicleCard({
  vehicle,
  firecallId,
}: {
  vehicle: Fzg;
  firecallId?: string;
}) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateVehicle = useFirecallItemUpdate(firecallId);

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
      {displayUpdateDialog && <FzgDialog onClose={updateFn} item={vehicle} />}
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
