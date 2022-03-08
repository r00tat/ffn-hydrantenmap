import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { Rohr } from '../components/firestore';
import useFirecallItemUpdate from '../hooks/useFirecallItemUpdate';
import ConfirmDialog from './ConfirmDialog';
import RohrDialog from './RohrDialog';

export default function RohrCard({
  rohr: rohr,
  firecallId,
}: {
  rohr: Rohr;
  firecallId?: string;
}) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateItem = useFirecallItemUpdate(firecallId);

  const updateFn = useCallback(
    (fzg?: Rohr) => {
      setDisplayUpdateDialog(false);
      if (fzg) {
        updateItem(fzg);
      }
    },
    [updateItem]
  );
  const deleteFn = useCallback(
    (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateItem({ ...rohr, deleted: true });
      }
    },
    [updateItem, rohr]
  );

  return (
    <Grid item xs={12} md={6} lg={4}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="div">
            {rohr.art} Rohr
          </Typography>
          <Typography sx={{ mb: 1.5 }} color="text.secondary">
            {rohr.durchfluss ? rohr.durchfluss + ' l/min' : ''}
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
      {displayUpdateDialog && <RohrDialog onClose={updateFn} item={rohr} />}
      {isConfirmOpen && (
        <ConfirmDialog
          title={`Rohr ${rohr.art} löschen`}
          text={`Rohr ${rohr.art} wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </Grid>
  );
}
