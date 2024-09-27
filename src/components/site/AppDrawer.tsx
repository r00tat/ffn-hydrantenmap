import { mdiBiohazard } from '@mdi/js';
import Icon from '@mdi/react';
import ApiIcon from '@mui/icons-material/Api';
import ChatIcon from '@mui/icons-material/Chat';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import GroupIcon from '@mui/icons-material/Group';
import InfoIcon from '@mui/icons-material/Info';
import LayersIcon from '@mui/icons-material/Layers';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import LoginIcon from '@mui/icons-material/Login';
import MapIcon from '@mui/icons-material/Map';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import UserIcon from '@mui/icons-material/Person';
import PrintIcon from '@mui/icons-material/Print';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Link from 'next/link';
import React, { useCallback } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

interface DrawerItem {
  text: string;
  icon: React.ReactNode;
  href: string;
  admin?: boolean;
}

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
  const { isAdmin } = useFirebaseLogin();

  const drawerItems: DrawerItem[] = [
    { text: 'Karte', icon: <MapIcon />, href: '/' },
    { text: 'Ebenen', icon: <LayersIcon />, href: '/ebenen' },
    { text: 'Fahrzeuge', icon: <DirectionsCarIcon />, href: '/fahrzeuge' },
    { text: 'Einsatz Tagebuch', icon: <LibraryBooksIcon />, href: '/tagebuch' },
    { text: 'Chat', icon: <ChatIcon />, href: '/chat' },
    { text: 'Geschäftsbuch', icon: <MenuBookIcon />, href: '/geschaeftsbuch' },
    { text: 'Drucken', icon: <PrintIcon />, href: '/print' },
    { text: 'Einsätze', icon: <LocalFireDepartmentIcon />, href: '/einsaetze' },
    {
      text: 'Schadstoff',
      icon: <Icon path={mdiBiohazard} size={1} />,
      href: '/schadstoff',
    },
    { text: 'Tokens', icon: <ApiIcon />, href: '/tokens' },
    { text: 'Login', icon: <LoginIcon />, href: '/login' },
    { text: 'About', icon: <InfoIcon />, href: '/about' },
    { text: 'Users', icon: <UserIcon />, href: '/users', admin: true },
    { text: 'Groups', icon: <GroupIcon />, href: '/groups', admin: true },
    {
      text: 'Admin',
      icon: <AdminPanelSettingsIcon />,
      href: '/admin',
      admin: true,
    },
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
            {drawerItems
              .filter((item) => isAdmin || !item.admin)
              .map(({ text, icon, href }, index) => (
                <Link href={href} passHref key={text} legacyBehavior>
                  <ListItem button key={text}>
                    <ListItemIcon>{icon}</ListItemIcon>
                    <ListItemText primary={text} />
                  </ListItem>
                </Link>
              ))}
          </List>
        </Box>
      </Drawer>
    </div>
  );
}
