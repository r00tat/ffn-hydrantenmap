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
  collection,
  doc,
  where,
} from 'firebase/firestore';
import { addDoc, deleteDoc, updateDoc } from '../../lib/firestoreClient';
import moment, { Moment } from 'moment';
import 'moment/locale/de';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations();
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
      <DialogTitle id="token-dialog-title">{t('tokens.dialogTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {token?.id && <>{t('tokens.tokenLabel', { id: token.id })}</>}
          {t.rich('tokens.intro', {
            host: window?.location?.hostname || '',
            link: (chunks) => (
              <a
                href="https://lagekarte.info"
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          id="description"
          label={t('tokens.descriptionLabel')}
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
            label={t('tokens.expiresLabel')}
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
        <Button onClick={() => handleClose(false)}>{t('common.cancel')}</Button>
        <Button
          onClick={() => handleClose(true)}
          color="primary"
          variant="contained"
          disabled={!description}
        >
          {t('common.ok')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

async function deleteToken(id: string) {
  return deleteDoc(doc(firestore, 'tokens', id));
}

function TokenExpiration({ expiresAt }: { expiresAt?: string }) {
  const t = useTranslations('tokens');
  if (!expiresAt) {
    return null;
  }
  const expirationDate = moment(expiresAt);
  const isExpired = expirationDate.isBefore(moment());
  const formatted = expirationDate.format('DD.MM.YYYY');
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{ color: isExpired ? 'error.main' : 'text.secondary', ml: 1 }}
    >
      {isExpired
        ? t('expired', { date: formatted })
        : t('validUntil', { date: formatted })}
    </Typography>
  );
}

export function TokenDisplay({ token }: { token: Token }) {
  const t = useTranslations('tokens');
  const [display, setDisplay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  return (
    <>
      <Typography>
        {token.description}
        <TokenExpiration expiresAt={token.expiresAt} />{' '}
        <IconButton
          aria-label={t('showApiKey')}
          onClick={() => setDisplay(!display)}
        >
          <VisibilityIcon />
        </IconButton>
        <IconButton aria-label={t('editApiKey')} onClick={() => setEdit(true)}>
          <EditIcon />
        </IconButton>
        <IconButton
          aria-label={t('deleteApiKey')}
          onClick={() => setDeleteDialog(true)}
        >
          <DeleteIcon />
        </IconButton>
        {display && (
          <>
            {t('apiKey')} <Typography variant="caption">{token.id}</Typography>
          </>
        )}
      </Typography>
      {edit && <TokenDialog onClose={() => setEdit(false)} token={token} />}
      {deleteDialog && (
        <ConfirmDialog
          title={t('deleteTitle', { description: token.description })}
          text={t('deleteConfirm', { description: token.description })}
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
  const t = useTranslations();
  const tokens = useTokens();
  const [addToken, setAddToken] = useState(false);
  const [token, setToken] = useState<Token>();
  return (
    <>
      <Grid container spacing={2} sx={{ padding: 2 }}>
        <Grid size={{ xs: 12 }}>
          <Typography variant="h4">{t('tokens.title')}</Typography>
          <Typography>
            {t.rich('tokens.intro', {
              host: window?.location?.hostname || '',
              link: (chunks) => (
                <a
                  href="https://lagekarte.info"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
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
        <InfoDialog
          title={t('tokens.newTokenTitle')}
          onConfirm={() => setToken(undefined)}
        >
          {t('tokens.newTokenCreated', { description: token.description })}{' '}
          <Typography variant="caption">{token.id}</Typography>
        </InfoDialog>
      )}
    </>
  );
}
