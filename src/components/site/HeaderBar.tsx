import HistoryIcon from '@mui/icons-material/History';
import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import React, { useCallback, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall from '../../hooks/useFirecall';
import useMapEditor from '../../hooks/useMapEditor';
import Tooltip from '@mui/material/Tooltip';
import HistoryDialog from './HistoryDialog';
import { FirecallHistory } from '../firebase/firestore';

function HeaderBar({
  isDrawerOpen,
  setIsDrawerOpen,
}: {
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { isSignedIn, displayName, photoURL, isAuthorized } =
    useFirebaseLogin();
  const firecall = useFirecall();
  const { history, selectHistory, historyId, selectedHistory } = useMapEditor();
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const historyDialogClose = useCallback((history?: FirecallHistory) => {
    setIsHistoryDialogOpen(false);
    selectHistory(history?.id);
  }, []);

  return (
    <>
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Einsatzkarte {firecall?.name || ''}
              {!isSignedIn && 'Anmeldung erforderlich'}
              {isSignedIn && !isAuthorized && 'Freischaltung erforderlich'}
            </Typography>

            {selectedHistory && (
              <Typography>{selectedHistory?.description}</Typography>
            )}

            {history.length > 0 && (
              <Tooltip title="Historie aufrufen">
                <Button
                  color="info"
                  style={{
                    backgroundColor: '#fff',
                    marginLeft: 8,
                    marginRight: 8,
                  }}
                  onClick={() => {
                    setIsHistoryDialogOpen(true);
                  }}
                >
                  <HistoryIcon />
                </Button>
              </Tooltip>
            )}
            {!isSignedIn && (
              <Link href="/login" passHref legacyBehavior>
                <Button color="inherit">Login</Button>
              </Link>
            )}
            {isSignedIn && (
              <Link href="/login" passHref legacyBehavior>
                <Avatar alt={displayName} src={photoURL} />
              </Link>
            )}
          </Toolbar>
        </AppBar>
      </Box>
      {isHistoryDialogOpen && <HistoryDialog onClose={historyDialogClose} />}
    </>
  );
}

export default HeaderBar;
