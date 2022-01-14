import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { doc, orderBy, setDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { filterActiveItems, Firecall } from '../components/firestore';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { useFirecall, useFirecallSelect } from '../hooks/useFirecall';
import ConfirmDialog from './ConfirmDialog';
import EinsatzDialog from './EinsatzDialog';
import { firestore } from './firebase';

function useFirecallUpdate() {
  const { email } = useFirebaseLogin();
  return useCallback(
    async (einsatz: Firecall) => {
      console.info(
        `update of einsatz ${einsatz.id}: ${JSON.stringify(einsatz)}`
      );
      await setDoc(
        doc(firestore, 'call', '' + einsatz.id),
        { ...einsatz, updatedAt: new Date(), updatedBy: email },
        { merge: true }
      );
    },
    [email]
  );
}

function EinsatzCard({
  einsatz,
  firecallId,
}: {
  einsatz: Firecall;
  firecallId?: string;
}) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateFirecall = useFirecallUpdate();
  const { isAdmin } = useFirebaseLogin();
  const setFirecallId = useFirecallSelect();

  const updateFn = useCallback(
    (fzg?: Firecall) => {
      setDisplayUpdateDialog(false);
      if (fzg) {
        updateFirecall(fzg);
      }
    },
    [updateFirecall]
  );
  const deleteFn = useCallback(
    (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateFirecall({ ...einsatz, deleted: true });
      }
    },
    [updateFirecall, einsatz]
  );

  return (
    <Grid item xs={12} md={6} lg={4}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="div">
            {einsatz.name} {einsatz.fw}{' '}
            {firecallId === einsatz.id ? '(aktiv)' : ''}
          </Typography>
          <Typography sx={{ mb: 1.5 }} color="text.secondary">
            {einsatz.date}
          </Typography>
          <Typography variant="body2">{einsatz.description}</Typography>
        </CardContent>
        <CardActions>
          <Tooltip title="Als aktiven Einsatz in der Anzeige setzten">
            <Button
              size="small"
              onClick={() => {
                if (setFirecallId) {
                  setFirecallId(einsatz.id);
                }
              }}
            >
              Aktivieren
            </Button>
          </Tooltip>
          <Button size="small" onClick={() => setDisplayUpdateDialog(true)}>
            Bearbeiten
          </Button>
          {isAdmin && (
            <Button
              size="small"
              onClick={() => setIsConfirmOpen(true)}
              color="error"
            >
              Löschen
            </Button>
          )}
        </CardActions>
      </Card>
      {displayUpdateDialog && (
        <EinsatzDialog onClose={updateFn} einsatz={einsatz} />
      )}
      {isConfirmOpen && (
        <ConfirmDialog
          title={`Einsatz ${einsatz.name} ${einsatz.date || ''} löschen`}
          text={`Einsatz ${einsatz.name} ${
            einsatz.date || ''
          } wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </Grid>
  );
}

export default function Einsaetze() {
  const { isAuthorized } = useFirebaseLogin();
  const [einsatzDialog, setEinsatzDialog] = useState(false);
  // const columns = useGridColumns();
  const firecall = useFirecall();
  const einsaetze = useFirebaseCollection<Firecall>({
    collectionName: 'call',
    // pathSegments: [firecall?.id || 'unkown', 'item'],
    queryConstraints: [
      orderBy('date', 'desc'),
      // where('type', '==', 'einsatz'),
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
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Einsätze
        </Typography>
        <Grid container spacing={2}>
          {einsaetze.map((einsatz) => (
            <EinsatzCard
              einsatz={einsatz}
              key={einsatz.id}
              firecallId={firecall?.id}
            />
          ))}
        </Grid>
      </Box>
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        onClick={() => setEinsatzDialog(true)}
      >
        <AddIcon />
      </Fab>
      {einsatzDialog && (
        <EinsatzDialog onClose={() => setEinsatzDialog(false)} />
      )}
    </>
  );
}
