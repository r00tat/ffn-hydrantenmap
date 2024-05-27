import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import React from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall from '../../hooks/useFirecall';

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

  return (
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
            Hydrantenkarte {firecall?.name || ''}
            {!isSignedIn && 'Anmeldung erforderlich'}
            {isSignedIn && !isAuthorized && 'Freischaltung erforderlich'}
          </Typography>
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
  );
}

export default HeaderBar;
