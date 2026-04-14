import { mdiBiohazard } from '@mdi/js';
import Icon from '@mdi/react';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import HistoryIcon from '@mui/icons-material/History';
import ApiIcon from '@mui/icons-material/Api';
import ChatIcon from '@mui/icons-material/Chat';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import GroupIcon from '@mui/icons-material/Group';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import InfoIcon from '@mui/icons-material/Info';
import LayersIcon from '@mui/icons-material/Layers';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import ListAltIcon from '@mui/icons-material/ListAlt';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import LoginIcon from '@mui/icons-material/Login';
import MapIcon from '@mui/icons-material/Map';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PlaceIcon from '@mui/icons-material/Place';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SmsIcon from '@mui/icons-material/Sms';
import UserIcon from '@mui/icons-material/Person';
import PrintIcon from '@mui/icons-material/Print';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Link from 'next/link';
import React, { useCallback } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';

interface DrawerItem {
  text: string;
  icon: React.ReactNode;
  href: string;
  admin?: boolean;
  /** When set, the link points to /einsatz/[firecallId]/[einsatzSection] */
  einsatzSection?: string;
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
    [setIsOpen],
  );
  const { isAdmin } = useFirebaseLogin();
  const firecallId = useFirecallId();

  const drawerItems: DrawerItem[] = [
    { text: 'Karte', icon: <MapIcon />, href: '/', einsatzSection: '' },
    {
      text: 'Einsätze',
      icon: <LocalFireDepartmentIcon />,
      href: '/einsaetze',
    },
    { text: 'Ebenen', icon: <LayersIcon />, href: '/ebenen', einsatzSection: 'ebenen' },
    { text: 'Einsatzmittel', icon: <DirectionsCarIcon />, href: '/einsatzmittel', einsatzSection: 'einsatzmittel' },
    {
      text: 'Einsatz Tagebuch',
      icon: <LibraryBooksIcon />,
      href: '/tagebuch',
      einsatzSection: 'tagebuch',
    },
    // { text: 'Tabelle', icon: <ListAltIcon />, href: '/sheet' },
    {
      text: 'Einsatzorte',
      icon: <PlaceIcon />,
      href: '/einsatzorte',
      einsatzSection: 'einsatzorte',
    },
    {
      text: 'Blaulicht-SMS',
      icon: <SmsIcon />,
      href: '/blaulicht-sms',
    },
    {
      text: 'Geschäftsbuch',
      icon: <MenuBookIcon />,
      href: '/geschaeftsbuch',
      einsatzSection: 'geschaeftsbuch',
    },
    {
      text: 'Kostenersatz',
      icon: <ReceiptLongIcon />,
      href: '/kostenersatz',
      einsatzSection: 'kostenersatz',
    },
    { text: 'Chat', icon: <ChatIcon />, href: '/chat', einsatzSection: 'chat' },
    { text: 'KI', icon: <AutoAwesomeIcon />, href: '/ai' },
    { text: 'Drucken', icon: <PrintIcon />, href: '/print', einsatzSection: 'print' },
    {
      text: 'Schadstoff',
      icon: <Icon path={mdiBiohazard} size={1} />,
      href: '/schadstoff',
      einsatzSection: 'schadstoff',
    },
    { text: 'Tokens', icon: <ApiIcon />, href: '/tokens' },
    { text: 'Audit Log', icon: <HistoryIcon />, href: '/auditlog', admin: true },
    { text: 'Users', icon: <UserIcon />, href: '/users', admin: true },
    { text: 'Groups', icon: <GroupIcon />, href: '/groups', admin: true },
    {
      text: 'Admin',
      icon: <AdminPanelSettingsIcon />,
      href: '/admin',
      admin: true,
    },
    { text: 'Dokumentation', icon: <HelpOutlineIcon />, href: '/docs' },
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
            {drawerItems
              .filter((item) => isAdmin || !item.admin)
              .map(({ text, icon, href, einsatzSection }) => {
                const resolvedHref =
                  einsatzSection != null &&
                  firecallId &&
                  firecallId !== 'unknown'
                    ? `/einsatz/${firecallId}${einsatzSection ? `/${einsatzSection}` : ''}`
                    : href;
                return (
                  <Link href={resolvedHref} passHref key={text}>
                    <ListItemButton key={text}>
                      <ListItemIcon>{icon}</ListItemIcon>
                      <ListItemText primary={text} />
                    </ListItemButton>
                  </Link>
                );
              })}
          </List>
        </Box>
      </Drawer>
    </div>
  );
}
