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
import useFirebaseLogin from '../hooks/useFirebaseLogin';

function HeaderBar({
  isDrawerOpen,
  setIsDrawerOpen,
}: {
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { isSignedIn, displayName, photoURL } = useFirebaseLogin();

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
            Hydrantenkarte
          </Typography>
          {!isSignedIn && (
            <Link href="/login" passHref>
              <Button color="inherit">Login</Button>
            </Link>
          )}
          {isSignedIn && (
            <Link href="/login" passHref>
              <Avatar alt={displayName} src={photoURL} />
            </Link>
          )}
        </Toolbar>
      </AppBar>
    </Box>
  );
}

export default HeaderBar;
