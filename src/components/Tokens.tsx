import AddIcon from '@mui/icons-material/Add';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { Token } from '../common/token';
import useFirebaseCollection from '../hooks/useFirebaseCollection';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { firestore } from './firebase/firebase';
import InputDialog from './InputDialog';
import VisibilityIcon from '@mui/icons-material/Visibility';
import IconButton from '@mui/material/IconButton';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ConfirmDialog from './ConfirmDialog';
import InfoDialog from './InfoDialog';

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
  const onClose = useCallback(
    async (value?: string) => {
      // hit ok or cancel on token dialog
      let newToken: Token | undefined = undefined;
      if (value) {
        if (token && token.id) {
          // update
          console.info(`update token ${token.id} ${value}`);
          await updateDoc(doc(firestore, 'tokens', `${token.id}`), {
            description: value,
          });
          newToken = { ...token, description: value };
        } else {
          // add
          console.info(`add token ${value}`);
          const docRef = await addDoc(collection(firestore, 'tokens'), {
            description: value,
            owner: user.uid,
          });
          newToken = {
            id: docRef.id,
            description: value,
            owner: user.uid || 'bad-uid',
          };
        }
      }
      console.info(`Token Dialog close: ${JSON.stringify(newToken)}`);
      onDialogClose(newToken);
    },
    [token, user, onDialogClose]
  );
  return (
    <InputDialog
      onClose={onClose}
      title="Token"
      defaultValue={token?.description}
    >
      Token: {token?.id} {token?.description}
      Ein Token kann für den API Zugriff auf Geojson (z.B.{' '}
      <a
        href="https://lagekarte.info"
        target="_blank"
        rel="noopener noreferrer"
      >
        lagekarte.info
      </a>
      ) verwendet werden. Die Schnittstelle ist unter https://
      {window?.location?.hostname}/api/geojson erreichbar. Der Token kann als
      HTTP GET Parameter oder Authorization Bearer Token verwendet werden.
    </InputDialog>
  );
}

async function deleteToken(id: string) {
  return deleteDoc(doc(firestore, 'tokens', id));
}

export function TokenDisplay({ token }: { token: Token }) {
  const [display, setDisplay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  return (
    <>
      <Typography>
        {token.description}{' '}
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
        <Grid item xs={12}>
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
          <Grid item xs={12} key={token.id}>
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
