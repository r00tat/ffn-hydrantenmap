import { mdiBiohazard } from '@mdi/js';
import Icon from '@mdi/react';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BiotechIcon from '@mui/icons-material/Biotech';
import BugReportIcon from '@mui/icons-material/BugReport';
import BuildIcon from '@mui/icons-material/Build';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import ApiIcon from '@mui/icons-material/Api';
import ChatIcon from '@mui/icons-material/Chat';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import GroupIcon from '@mui/icons-material/Group';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import HubIcon from '@mui/icons-material/Hub';
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
import SensorsIcon from '@mui/icons-material/Sensors';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SmsIcon from '@mui/icons-material/Sms';
import StorageIcon from '@mui/icons-material/Storage';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import UserIcon from '@mui/icons-material/Person';
import PrintIcon from '@mui/icons-material/Print';
import WavesIcon from '@mui/icons-material/Waves';
import WarningIcon from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import { useBugReport } from '../bugReport/BugReportProvider';

interface DrawerItem {
  text: string;
  icon: React.ReactNode;
  href: string;
  admin?: boolean;
  signedInOnly?: boolean;
  /** When set, the link points to /einsatz/[firecallId]/[einsatzSection] */
  einsatzSection?: string;
  children?: DrawerItem[];
  /** When set, render as a non-link clickable that invokes this handler. */
  onClick?: () => void;
}

function resolveHref(
  item: DrawerItem,
  firecallId: string | undefined,
): string {
  if (
    item.einsatzSection != null &&
    firecallId &&
    firecallId !== 'unknown'
  ) {
    return `/einsatz/${firecallId}${item.einsatzSection ? `/${item.einsatzSection}` : ''}`;
  }
  return item.href;
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
  const { isAdmin, isSignedIn } = useFirebaseLogin();
  const firecallId = useFirecallId();
  const pathname = usePathname();
  const t = useTranslations('drawer');
  const bugReport = useBugReport();

  const drawerItems: DrawerItem[] = [
    { text: t('map'), icon: <MapIcon />, href: '/', einsatzSection: '' },
    { text: t('details'), icon: <InfoIcon />, href: '/', einsatzSection: 'details' },
    {
      text: t('firecalls'),
      icon: <LocalFireDepartmentIcon />,
      href: '/einsaetze',
    },
    { text: t('layers'), icon: <LayersIcon />, href: '/ebenen', einsatzSection: 'ebenen' },
    { text: t('units'), icon: <DirectionsCarIcon />, href: '/einsatzmittel', einsatzSection: 'einsatzmittel' },
    {
      text: t('diary'),
      icon: <LibraryBooksIcon />,
      href: '/tagebuch',
      einsatzSection: 'tagebuch',
    },
    // { text: 'Tabelle', icon: <ListAltIcon />, href: '/sheet' },
    {
      text: t('locations'),
      icon: <PlaceIcon />,
      href: '/einsatzorte',
      einsatzSection: 'einsatzorte',
    },
    {
      text: t('blaulichtSms'),
      icon: <SmsIcon />,
      href: '/blaulicht-sms',
    },
    {
      text: t('geschaeftsbuch'),
      icon: <MenuBookIcon />,
      href: '/geschaeftsbuch',
      einsatzSection: 'geschaeftsbuch',
    },
    {
      text: t('kostenersatz'),
      icon: <ReceiptLongIcon />,
      href: '/kostenersatz',
      einsatzSection: 'kostenersatz',
    },
    { text: t('chat'), icon: <ChatIcon />, href: '/chat', einsatzSection: 'chat' },
    { text: t('ai'), icon: <AutoAwesomeIcon />, href: '/ai' },
    { text: t('print'), icon: <PrintIcon />, href: '/print', einsatzSection: 'print' },
    {
      text: t('hazmat'),
      icon: <Icon path={mdiBiohazard} size={1} />,
      href: '/schadstoff',
      einsatzSection: 'schadstoff',
      children: [
        {
          text: t('hazmatDatabase'),
          icon: <BiotechIcon />,
          href: '/schadstoff/datenbank',
          einsatzSection: 'schadstoff/datenbank',
        },
        {
          text: t('radiationCalculator'),
          icon: <WarningIcon />,
          href: '/schadstoff/strahlenschutz',
          einsatzSection: 'schadstoff/strahlenschutz',
        },
        {
          text: t('radiationMeasurement'),
          icon: <SensorsIcon />,
          href: '/schadstoff/dosimetrie',
          einsatzSection: 'schadstoff/dosimetrie',
        },
        {
          text: t('nuclideIdentification'),
          icon: <ShowChartIcon />,
          href: '/schadstoff/energiespektrum',
          einsatzSection: 'schadstoff/energiespektrum',
        },
      ],
    },
    { text: t('tokens'), icon: <ApiIcon />, href: '/tokens' },
    { text: t('auditLog'), icon: <HistoryIcon />, href: '/auditlog', admin: true },
    { text: t('users'), icon: <UserIcon />, href: '/users', admin: true },
    { text: t('groups'), icon: <GroupIcon />, href: '/groups', admin: true },
    {
      text: t('admin'),
      icon: <AdminPanelSettingsIcon />,
      href: '/admin',
      admin: true,
      children: [
        { text: t('adminActions'), icon: <BuildIcon />, href: '/admin/actions' },
        { text: t('gisDataPipeline'), icon: <StorageIcon />, href: '/admin/gis-data' },
        { text: t('hydrantClusters'), icon: <HubIcon />, href: '/admin/hydrant-clusters' },
        { text: t('adminKostenersatz'), icon: <ReceiptLongIcon />, href: '/admin/kostenersatz' },
        { text: t('pegelstaende'), icon: <WavesIcon />, href: '/admin/pegelstaende' },
        { text: t('deletedItems'), icon: <DeleteIcon />, href: '/admin/deleted-items' },
        { text: t('hydrantCsvImport'), icon: <CloudUploadIcon />, href: '/admin/hydranten-csv-import' },
        { text: t('bugReports'), icon: <BugReportIcon />, href: '/admin/bug-reports' },
      ],
    },
    {
      text: t('feedbackBugReport'),
      icon: <BugReportIcon />,
      href: '#',
      onClick: () => bugReport.open(),
    },
    { text: t('documentation'), icon: <HelpOutlineIcon />, href: '/docs' },
    { text: t('login'), icon: <LoginIcon />, href: '/login' },
    {
      text: t('profile'),
      icon: <AccountCircleIcon />,
      href: '/profile',
      signedInOnly: true,
    },
    { text: t('about'), icon: <InfoIcon />, href: '/about' },
  ];

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (!pathname) return initial;
    for (const item of drawerItems) {
      if (!item.children) continue;
      const prefixes = [item.href];
      if (item.einsatzSection != null && firecallId && firecallId !== 'unknown') {
        prefixes.push(
          `/einsatz/${firecallId}${item.einsatzSection ? `/${item.einsatzSection}` : ''}`,
        );
      }
      if (prefixes.some((p) => p && pathname.startsWith(p))) {
        initial[item.text] = true;
      }
    }
    return initial;
  });

  const toggleMenu = useCallback((text: string) => {
    setOpenMenus((prev) => ({ ...prev, [text]: !prev[text] }));
  }, []);

  return (
    <div>
      <Drawer anchor="left" open={isOpen} onClose={toggleDrawer}>
        <Box
          sx={{ width: 250 }}
          role="presentation"
          onKeyDown={toggleDrawer}
        >
          <List>
            {drawerItems
              .filter((item) => isAdmin || !item.admin)
              .filter((item) => isSignedIn || !item.signedInOnly)
              .map((item) => {
                if (item.children) {
                  const open = !!openMenus[item.text];
                  return (
                    <React.Fragment key={item.text}>
                      <ListItemButton onClick={() => toggleMenu(item.text)}>
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} />
                        {open ? <ExpandLess /> : <ExpandMore />}
                      </ListItemButton>
                      <Collapse in={open} timeout="auto" unmountOnExit>
                        <List component="div" disablePadding>
                          {item.children.map((child) => {
                            const childHref = resolveHref(child, firecallId);
                            return (
                              <Link href={childHref} passHref key={child.text}>
                                <ListItemButton
                                  sx={{ pl: 4 }}
                                  onClick={toggleDrawer}
                                >
                                  <ListItemIcon>{child.icon}</ListItemIcon>
                                  <ListItemText primary={child.text} />
                                </ListItemButton>
                              </Link>
                            );
                          })}
                        </List>
                      </Collapse>
                    </React.Fragment>
                  );
                }

                if (item.onClick) {
                  return (
                    <ListItemButton
                      key={item.text}
                      onClick={() => {
                        item.onClick!();
                        setIsOpen(false);
                      }}
                    >
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      <ListItemText primary={item.text} />
                    </ListItemButton>
                  );
                }

                const resolvedHref = resolveHref(item, firecallId);
                return (
                  <Link href={resolvedHref} passHref key={item.text}>
                    <ListItemButton onClick={toggleDrawer}>
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      <ListItemText primary={item.text} />
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
