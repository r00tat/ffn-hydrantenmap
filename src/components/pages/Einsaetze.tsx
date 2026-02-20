'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShareIcon from '@mui/icons-material/Share';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Drawer from '@mui/material/Drawer';
import Fab from '@mui/material/Fab';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { doc, orderBy, setDoc, where } from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { createCustomFirebaseTokenForFirecall } from '../../app/actions/auth';
import { formatTimestamp } from '../../common/time-format';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId, useFirecallSelect } from '../../hooks/useFirecall';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import FirecallExport from '../firebase/FirecallExport';
import FirecallImport from '../firebase/FirecallImport';
import { firestore } from '../firebase/firebase';
import { FIRECALL_COLLECTION_ID, Firecall } from '../firebase/firestore';
import { KostenersatzList } from '../Kostenersatz';
import { useAuditLog } from '../../hooks/useAuditLog';

function useFirecallUpdate() {
  const { email } = useFirebaseLogin();
  const logChange = useAuditLog();
  return useCallback(
    async (einsatz: Firecall) => {
      console.info(
        `update of einsatz ${einsatz.id}: ${JSON.stringify(einsatz)}`
      );
      await setDoc(
        doc(firestore, FIRECALL_COLLECTION_ID, '' + einsatz.id),
        { ...einsatz, updatedAt: new Date().toISOString(), updatedBy: email },
        { merge: true }
      );

      logChange({
        action: 'update',
        elementType: 'firecall',
        elementId: einsatz.id || '',
        elementName: einsatz.name || '',
        firecallId: einsatz.id,
        newValue: { name: einsatz.name, description: einsatz.description, alarmierung: einsatz.alarmierung, eintreffen: einsatz.eintreffen, abruecken: einsatz.abruecken },
      });
    },
    [email, logChange]
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
  const [kostenersatzOpen, setKostenersatzOpen] = useState(false);
  const updateFirecall = useFirecallUpdate();
  const { isAdmin, groups } = useFirebaseLogin();
  const setFirecallId = useFirecallSelect();
  const router = useRouter();
  const [tokenLink, setTokenLink] = useState<string>();
  const [error, setError] = useState<string>();

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

  const createLink = useCallback(async (firefallId: string) => {
    setError('');
    const token = await createCustomFirebaseTokenForFirecall(firefallId);
    console.info('created new token for link:', token);
    if (token.token) {
      const tokenLink = `${window.location.origin}/einsatz/${firefallId}?token=${token.token}`;
      setTokenLink(tokenLink);
      if (navigator.clipboard?.writeText) {
        // we do not know if it was successfull so we do not show an info
        navigator.clipboard.writeText(tokenLink);
      }
    } else {
      setError(`Token konnte nicht erstellt werden: ${token.error}`);
      console.warn(`unable to create token: ${token.error}\n${token.details}`);
    }
  }, []);

  return (
    <Grid size={{ xs: 12, md: 6, lg: 4 }}>
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
          {tokenLink && (
            <Link href={tokenLink} target="_blank">
              {tokenLink.substring(0, 100)}...
            </Link>
          )}
          {error && <Typography color="error">{error}</Typography>}
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
          <Tooltip title="Link für anonymen Zugriff erstellen">
            <IconButton
              size="small"
              onClick={() => {
                if (einsatz.id) {
                  createLink(einsatz.id);
                }
              }}
            >
              <ShareIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Kostenersatz-Berechnungen">
            <IconButton
              size="small"
              onClick={() => setKostenersatzOpen(true)}
              color="primary"
            >
              <ReceiptLongIcon />
            </IconButton>
          </Tooltip>
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
      <Drawer
        anchor="right"
        open={kostenersatzOpen}
        onClose={() => setKostenersatzOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 500, md: 600 }, p: 2 } }}
      >
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{einsatz.name}</Typography>
          <Button onClick={() => setKostenersatzOpen(false)}>Schließen</Button>
        </Box>
        {einsatz.id && (
          <KostenersatzList firecallId={einsatz.id} />
        )}
      </Drawer>
    </Grid>
  );
}

export default function Einsaetze() {
  const { isAuthorized, groups, myGroups } = useFirebaseLogin();
  const [einsatzDialog, setEinsatzDialog] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>('all');

  const filterFn = useCallback(
    (g: Firecall) =>
      g.deleted === false && (groupFilter === 'all' || g.group === groupFilter),
    [groupFilter]
  );

  // const columns = useGridColumns();
  const firecallId = useFirecallId();
  const einsaetze = useFirebaseCollection<Firecall>({
    collectionName: FIRECALL_COLLECTION_ID,
    // pathSegments: [firecallId || 'unknown', FIRECALL_ITEMS_COLLECTION_ID],
    queryConstraints: [
      where('deleted', '==', false),
      where('group', 'in', groups),
      // where('group', '==', 'ffnd'),
      orderBy('date', 'desc'),
      // where('type', '==', 'einsatz'),
      // orderBy('fw'),
      // orderBy('name'),
      // where('deleted', '!=', false),
    ],
    filterFn,
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
          <Grid size={{ xs: 6 }}>
            <FirecallImport />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth variant="standard">
              <InputLabel id="firecall-group-label-choose">
                Gruppenfilter
              </InputLabel>
              <Select
                labelId="firecall-group-label-choose"
                id="firecall-item-type-choose"
                value={groupFilter}
                label="Art"
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <MenuItem value={'all'}>Alle Gruppen</MenuItem>
                {myGroups.map((group) => (
                  <MenuItem key={`group-${group.id}`} value={group.id}>
                    {group.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
