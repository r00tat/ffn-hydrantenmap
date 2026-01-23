'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
  where,
} from 'firebase/firestore';
import moment, { Moment } from 'moment';
import 'moment/locale/de';
import { useCallback, useState } from 'react';
import { Token } from '../../common/token';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { firestore } from '../firebase/firebase';
import InfoDialog from '../dialogs/InfoDialog';

export function useTokens() {
  const user = useFirebaseLogin();
  return useFirebaseCollection<Token>({
    collectionName: 'tokens',
    queryConstraints: [where('owner', '==', '' + user.uid)],
  });
}

export interface TokenDialogOptions {
  token?: Token;
  onClose: (token?: Token) => void;
}

export function TokenDialog({
  token,
  onClose: onDialogClose,
}: TokenDialogOptions) {
  const user = useFirebaseLogin();
  const [open, setOpen] = useState(true);
  const [description, setDescription] = useState(token?.description || '');
  const [expiresAt, setExpiresAt] = useState<Moment | null>(
    token?.expiresAt ? moment(token.expiresAt) : null
  );

  const handleClose = useCallback(
    async (save: boolean) => {
      setOpen(false);
      let newToken: Token | undefined = undefined;
      if (save && description) {
        const expiresAtValue = expiresAt?.toISOString() || null;
        if (token && token.id) {
          // update
          console.info(`update token ${token.id} ${description}`);
          await updateDoc(doc(firestore, 'tokens', `${token.id}`), {
            description,
            expiresAt: expiresAtValue,
          });
          newToken = {
            ...token,
            description,
            expiresAt: expiresAtValue || undefined,
          };
        } else {
          // add
          console.info(`add token ${description}`);
          const tokenData: Record<string, unknown> = {
            description,
            owner: user.uid,
          };
          if (expiresAtValue) {
            tokenData.expiresAt = expiresAtValue;
          }
          const docRef = await addDoc(
            collection(firestore, 'tokens'),
            tokenData
          );
          newToken = {
            id: docRef.id,
            description,
            owner: user.uid || 'bad-uid',
            expiresAt: expiresAtValue || undefined,
          };
        }
      }
      console.info(`Token Dialog close: ${JSON.stringify(newToken)}`);
      onDialogClose(newToken);
    },
    [token, user, onDialogClose, description, expiresAt]
  );

  return (
    <Dialog
      open={open}
      onClose={() => handleClose(false)}
      aria-labelledby="token-dialog-title"
    >
      <DialogTitle id="token-dialog-title">Token</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {token?.id && <>Token: {token.id}</>}
          Ein Token kann für den API Zugriff auf Geojson (z.B.{' '}
          <a
            href="https://lagekarte.info"
            target="_blank"
            rel="noopener noreferrer"
          >
            lagekarte.info
          </a>
          ) verwendet werden. Die Schnittstelle ist unter https://
          {window?.location?.hostname}/api/geojson erreichbar. Der Token kann
          als HTTP GET Parameter oder Authorization Bearer Token verwendet
          werden.
        </DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          id="description"
          label="Beschreibung"
          type="text"
          fullWidth
          variant="standard"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleClose(true);
            }
          }}
        />
        <LocalizationProvider dateAdapter={AdapterMoment} adapterLocale="de-DE">
          <DatePicker
            label="Ablaufdatum (optional)"
            value={expiresAt}
            onChange={(newValue) => setExpiresAt(newValue)}
            slotProps={{
              textField: { fullWidth: true, margin: 'dense', variant: 'standard' },
              field: { clearable: true },
            }}
          />
        </LocalizationProvider>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => handleClose(false)}>Abbrechen</Button>
        <Button
          onClick={() => handleClose(true)}
          color="primary"
          variant="contained"
          disabled={!description}
        >
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  );
}

async function deleteToken(id: string) {
  return deleteDoc(doc(firestore, 'tokens', id));
}

function TokenExpiration({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) {
    return null;
  }
  const expirationDate = moment(expiresAt);
  const isExpired = expirationDate.isBefore(moment());
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{ color: isExpired ? 'error.main' : 'text.secondary', ml: 1 }}
    >
      {isExpired
        ? `(abgelaufen am ${expirationDate.format('DD.MM.YYYY')})`
        : `(gültig bis ${expirationDate.format('DD.MM.YYYY')})`}
    </Typography>
  );
}

export function TokenDisplay({ token }: { token: Token }) {
  const [display, setDisplay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  return (
    <>
      <Typography>
        {token.description}
        <TokenExpiration expiresAt={token.expiresAt} />{' '}
        <IconButton
          aria-label="show api key"
          onClick={() => setDisplay(!display)}
        >
          <VisibilityIcon />
        </IconButton>
        <IconButton aria-label="edit api key" onClick={() => setEdit(true)}>
          <EditIcon />
        </IconButton>
        <IconButton
          aria-label="delete api key"
          onClick={() => setDeleteDialog(true)}
        >
          <DeleteIcon />
        </IconButton>
        {display && (
          <>
            API Key: <Typography variant="caption">{token.id}</Typography>
          </>
        )}
      </Typography>
      {edit && <TokenDialog onClose={() => setEdit(false)} token={token} />}
      {deleteDialog && (
        <ConfirmDialog
          title={`Token ${token.description} löschen`}
          text={`Token ${token.description}  wirklich löschen?`}
          onConfirm={(confirmed: boolean) => {
            if (confirmed && token?.id) {
              deleteToken(token.id);
            }
            setDeleteDialog(false);
          }}
        />
      )}
    </>
  );
}

export default function Tokens() {
  const tokens = useTokens();
  const [addToken, setAddToken] = useState(false);
  const [token, setToken] = useState<Token>();
  return (
    <>
      <Grid container spacing={2} padding={2}>
        <Grid size={{ xs: 12 }}>
          <Typography variant="h4">API Token</Typography>
          <Typography>
            Ein Token kann für den API Zugriff auf Geojson (z.B.{' '}
            <a
              href="https://lagekarte.info"
              target="_blank"
              rel="noopener noreferrer"
            >
              lagekarte.info
            </a>
            ) verwendet werden. Die Schnittstelle ist unter https://
            {window?.location?.hostname}/api/geojson erreichbar. Der Token kann
            als HTTP GET Parameter oder Authorization Bearer Token verwendet
            werden.
          </Typography>
        </Grid>
        {tokens.map((token) => (
          <Grid size={{ xs: 12 }} key={token.id}>
            <TokenDisplay token={token} key={token.id} />
          </Grid>
        ))}
        {/* <Button onClick={() => setAddToken(true)}>Neuen Token Anlegen</Button> */}
      </Grid>
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        onClick={() => setAddToken(true)}
      >
        <AddIcon />
      </Fab>

      {addToken && (
        <TokenDialog
          onClose={(newToken) => {
            setToken(newToken);
            setAddToken(false);
          }}
        />
      )}

      {token && (
        <InfoDialog title="Neuer Token" onConfirm={() => setToken(undefined)}>
          Ein neuer Token {token.description} wurde erstellt:{' '}
          <Typography variant="caption">{token.id}</Typography>
        </InfoDialog>
      )}
    </>
  );
}
