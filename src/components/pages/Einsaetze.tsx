import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { doc, orderBy, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId, useFirecallSelect } from '../../hooks/useFirecall';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import FirecallExport from '../firebase/FirecallExport';
import FirecallImport from '../firebase/FirecallImport';
import { firestore } from '../firebase/firebase';
import { Firecall, filterActiveItems } from '../firebase/firestore';

function useFirecallUpdate() {
  const { email } = useFirebaseLogin();
  return useCallback(
    async (einsatz: Firecall) => {
      console.info(
        `update of einsatz ${einsatz.id}: ${JSON.stringify(einsatz)}`
      );
      await setDoc(
        doc(firestore, 'call', '' + einsatz.id),
        { ...einsatz, updatedAt: new Date().toISOString(), updatedBy: email },
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
  const router = useRouter();

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
            {formatTimestamp(einsatz.date)}
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
                router.push(`/einsatz/${einsatz.id}`);
              }}
            >
              Aktivieren
            </Button>
          </Tooltip>
          {einsatz.id && <FirecallExport firecallId={einsatz.id} />}

          <Tooltip title="Bearbeiten">
            <IconButton
              size="small"
              onClick={() => setDisplayUpdateDialog(true)}
            >
              <EditIcon />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Löschen">
              <IconButton
                size="small"
                onClick={() => setIsConfirmOpen(true)}
                color="error"
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
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
  const firecallId = useFirecallId();
  const einsaetze = useFirebaseCollection<Firecall>({
    collectionName: 'call',
    // pathSegments: [firecallId || 'unknown', 'item'],
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
          <Grid item xs={12}>
            <FirecallImport />
          </Grid>
          {einsaetze.map((einsatz) => (
            <EinsatzCard
              einsatz={einsatz}
              key={einsatz.id}
              firecallId={firecallId}
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
