import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import InfoIcon from '@mui/icons-material/Info';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import LoginIcon from '@mui/icons-material/Login';
import MapIcon from '@mui/icons-material/Map';
import UserIcon from '@mui/icons-material/Person';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Link from 'next/link';
import React, { useCallback } from 'react';
import useFirebaseLogin from '../hooks/useFirebaseLogin';

export default function AppDrawer({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const toggleDrawer = useCallback(
    (event: React.KeyboardEvent | React.MouseEvent) => {
      if (
        event.type === 'keydown' &&
        ((event as React.KeyboardEvent).key === 'Tab' ||
          (event as React.KeyboardEvent).key === 'Shift')
      ) {
        return;
      }

      setIsOpen((prev) => !prev);
    },
    [setIsOpen]
  );
  const { isSignedIn, email, isAuthorized } = useFirebaseLogin();

  const drawerItems = [
    { text: 'Karte', icon: <MapIcon />, href: '/' },
    { text: 'Login', icon: <LoginIcon />, href: '/login' },
    { text: 'About', icon: <InfoIcon />, href: '/about' },
  ];

  return (
    <div>
      <Drawer anchor="left" open={isOpen} onClose={toggleDrawer}>
        <Box
          sx={{ width: 250 }}
          role="presentation"
          onClick={toggleDrawer}
          onKeyDown={toggleDrawer}
        >
          <List>
            {drawerItems.map(({ text, icon, href }, index) => (
              <Link href={href} passHref key={text}>
                <ListItem button key={text}>
                  <ListItemIcon>{icon}</ListItemIcon>
                  <ListItemText primary={text} />
                </ListItem>
              </Link>
            ))}

            {isSignedIn && email === 'paul.woelfel@ff-neusiedlamsee.at' && (
              <Link href="/users" passHref>
                <ListItem button key="users">
                  <ListItemIcon>
                    <UserIcon />
                  </ListItemIcon>
                  <ListItemText primary="Users" />
                </ListItem>
              </Link>
            )}

            {isAuthorized && (
              <>
                <Link href="/fahrzeuge" passHref>
                  <ListItem button key="fahrzeuge">
                    <ListItemIcon>
                      <DirectionsCarIcon />
                    </ListItemIcon>
                    <ListItemText primary="Fahrzeuge" />
                  </ListItem>
                </Link>
                <Link href="/einsaetze" passHref>
                  <ListItem button key="einsaetze">
                    <ListItemIcon>
                      <LocalFireDepartmentIcon />
                    </ListItemIcon>
                    <ListItemText primary="Einsätze" />
                  </ListItem>
                </Link>
              </>
            )}
          </List>
        </Box>
      </Drawer>
    </div>
  );
}
