import { mdiBiohazard } from '@mdi/js';
import Icon from '@mdi/react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AirIcon from '@mui/icons-material/Air';
import ApiIcon from '@mui/icons-material/Api';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BiotechIcon from '@mui/icons-material/Biotech';
import BugReportIcon from '@mui/icons-material/BugReport';
import BuildIcon from '@mui/icons-material/Build';
import CarCrashIcon from '@mui/icons-material/CarCrash';
import ChatIcon from '@mui/icons-material/Chat';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import EditRoadIcon from '@mui/icons-material/EditRoad';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import FoundationIcon from '@mui/icons-material/Foundation';
import FloodIcon from '@mui/icons-material/Flood';
import GroupIcon from '@mui/icons-material/Group';
import HandymanIcon from '@mui/icons-material/Handyman';
import HelpCenterIcon from '@mui/icons-material/HelpCenter';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import HistoryIcon from '@mui/icons-material/History';
import HubIcon from '@mui/icons-material/Hub';
import InfoIcon from '@mui/icons-material/Info';
import LayersIcon from '@mui/icons-material/Layers';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LoginIcon from '@mui/icons-material/Login';
import MapIcon from '@mui/icons-material/Map';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import UserIcon from '@mui/icons-material/Person';
import PinIcon from '@mui/icons-material/Pin';
import PlaceIcon from '@mui/icons-material/Place';
import PrintIcon from '@mui/icons-material/Print';
import PropaneTankIcon from '@mui/icons-material/PropaneTank';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SensorsIcon from '@mui/icons-material/Sensors';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SmsIcon from '@mui/icons-material/Sms';
import StorageIcon from '@mui/icons-material/Storage';
import WarningIcon from '@mui/icons-material/Warning';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WavesIcon from '@mui/icons-material/Waves';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
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
import { hasAnyGroupAdminRole } from '../../common/groupPermissions';
import { KOSTENERSATZ_GROUP } from '../../common/kostenersatz';
import { hasAnyFahrtenbuchManagerRole } from '../Fahrtenbuch/managerPermissions';
import { useBugReport } from '../bugReport/BugReportProvider';

/** Ein anklickbarer Menüpunkt — Link oder Aktion. */
interface DrawerLink {
  text: string;
  icon: React.ReactNode;
  href: string;
  admin?: boolean;
  /**
   * Sichtbar für Admins, Gruppen-Admins *und* Fahrtenbuch-Gerätemeister. Nicht
   * über `admin` abbildbar, weil dieses Flag ein Dutzend anderer Einträge
   * steuert.
   */
  fahrtenbuchAdmin?: boolean;
  /**
   * Sichtbar für Admins und Gruppen-Admins. Wie `fahrtenbuchAdmin` ein eigenes
   * Flag, weil `admin` ein Dutzend anderer Einträge steuert — nur ohne den
   * Gerätemeister, der mit der Atemschutz-Ausrüstung nichts zu tun hat.
   */
  groupAdminOnly?: boolean;
  /**
   * Sichtbar nur mit der Kostenersatz-Freischaltung. Eigenes Flag wie
   * `groupAdminOnly`: Die Verrechnung der Füllungen hängt an derselben
   * Berechtigung wie der Kostenersatz, nicht an einer Admin-Rolle.
   */
  kostenersatzOnly?: boolean;
  signedInOnly?: boolean;
  /** When set, the link points to /einsatz/[firecallId]/[einsatzSection] */
  einsatzSection?: string;
  /** When set, render as a non-link clickable that invokes this handler. */
  onClick?: () => void;
}

/**
 * Eine Gruppe ist ein reiner Aufklapper ohne eigenes Ziel. Die Übersichtsseiten
 * mancher Gruppen (etwa /schadstoff) bleiben über die URL erreichbar.
 */
interface DrawerGroup {
  text: string;
  icon: React.ReactNode;
  children: DrawerLink[];
}

function resolveHref(item: DrawerLink, firecallId: string | undefined): string {
  if (item.einsatzSection != null && firecallId && firecallId !== 'unknown') {
    return `/einsatz/${firecallId}${item.einsatzSection ? `/${item.einsatzSection}` : ''}`;
  }
  return item.href;
}

/** Zustand direkt nach einem Seitenwechsel: nur die aktive Gruppe ist offen. */
function defaultOpen(group?: string): Record<string, boolean> {
  return group ? { [group]: true } : {};
}

/**
 * Eindeutige Kennung eines Menüpunkts. Zwei Punkte können dasselbe Ziel haben —
 * ohne laufenden Einsatz zeigen „Karte" und „Details" beide auf `/` —, markiert
 * werden darf aber nur einer.
 */
function itemKey(text: string, group?: string): string {
  return `${group ?? ''}|${text}`;
}

/**
 * Trifft der Link die aktuelle Seite? `/fahrtenbuch` passt auch auf
 * `/fahrtenbuch/maengel`, damit Unterseiten ihre Gruppe öffnen — welcher der
 * passenden Links markiert wird, entscheidet {@link findActive}.
 */
function isActiveCandidate(pathname: string, href: string): boolean {
  if (!href || href === '#') return false;
  if (pathname === href) return true;
  return href !== '/' && pathname.startsWith(`${href}/`);
}

/**
 * Der längste passende Link gewinnt: auf `/fahrtenbuch/maengel` ist damit nur
 * „Mängel" markiert und nicht zusätzlich das „Fahrtenbuch".
 */
function findActive(
  directItems: DrawerLink[],
  groups: DrawerGroup[],
  firecallId: string | undefined,
  pathname: string,
): { key?: string; group?: string } {
  let best: { key?: string; group?: string } = {};
  let bestLength = -1;

  const consider = (item: DrawerLink, group?: string) => {
    const href = resolveHref(item, firecallId);
    if (!isActiveCandidate(pathname, href)) return;
    // Bei gleich langem Ziel gewinnt der erste Eintrag der Reihenfolge.
    if (href.length <= bestLength) return;
    bestLength = href.length;
    best = { key: itemKey(item.text, group), group };
  };

  directItems.forEach((item) => consider(item));
  groups.forEach((group) =>
    group.children.forEach((child) => consider(child, group.text)),
  );

  return best;
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
  const {
    isAdmin,
    isSignedIn,
    fahrtenbuchGeraetemeister,
    groupAdmin,
    // `groups` heißt in dieser Datei bereits die Menüstruktur — die Freigaben
    // des Benutzers brauchen deshalb einen eigenen Namen.
    groups: userGroups,
  } = useFirebaseLogin();
  const firecallId = useFirecallId();
  const pathname = usePathname();
  const t = useTranslations('drawer');
  const bugReport = useBugReport();

  /** Immer ohne Aufklappen erreichbar. */
  const directItems: DrawerLink[] = [
    { text: t('map'), icon: <MapIcon />, href: '/', einsatzSection: '' },
    {
      text: t('details'),
      icon: <InfoIcon />,
      href: '/',
      einsatzSection: 'details',
    },
    {
      text: t('firecalls'),
      icon: <LocalFireDepartmentIcon />,
      href: '/einsaetze',
    },
  ];

  const groups: DrawerGroup[] = [
    {
      text: t('groupSituation'),
      icon: <MyLocationIcon />,
      children: [
        {
          text: t('layers'),
          icon: <LayersIcon />,
          href: '/ebenen',
          einsatzSection: 'ebenen',
        },
        {
          text: t('units'),
          icon: <DirectionsCarIcon />,
          href: '/einsatzmittel',
          einsatzSection: 'einsatzmittel',
        },
        {
          text: t('locations'),
          icon: <PlaceIcon />,
          href: '/einsatzorte',
          einsatzSection: 'einsatzorte',
        },
        {
          text: t('atemschutz'),
          icon: <AirIcon />,
          href: '/atemschutz',
          einsatzSection: 'atemschutz',
        },
        {
          // Neben der Karte und nicht darin: Die Frage „Leitung legen oder
          // pendeln?" kommt vor dem Zeichnen. Die Seite bringt ihre eigene
          // schmale Karte mit.
          text: t('loeschwasserversorgung'),
          icon: <WaterDropIcon />,
          href: '/loeschwasserversorgung',
          einsatzSection: 'loeschwasserversorgung',
        },
        {
          // Aus demselben Grund neben der Karte: „Reichen Säcke und Kräfte für
          // diese Strecke?" kommt vor dem Zeichnen der Dammlinie.
          text: t('dammbau'),
          icon: <FoundationIcon />,
          href: '/dammbau',
          einsatzSection: 'dammbau',
        },
        {
          // Die Frage nach der überfluteten Fläche steht vor dem Dammbau: sie
          // sagt erst, wo überhaupt ein Damm gebraucht wird.
          text: t('hochwasser'),
          icon: <FloodIcon />,
          href: '/hochwasser',
          einsatzSection: 'hochwasser',
        },
      ],
    },
    {
      text: t('groupOperationDocs'),
      icon: <DescriptionIcon />,
      children: [
        {
          text: t('diary'),
          icon: <LibraryBooksIcon />,
          href: '/tagebuch',
          einsatzSection: 'tagebuch',
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
        {
          text: t('chat'),
          icon: <ChatIcon />,
          href: '/chat',
          einsatzSection: 'chat',
        },
        {
          text: t('print'),
          icon: <PrintIcon />,
          href: '/print',
          einsatzSection: 'print',
        },
      ],
    },
    {
      text: t('groupVehicles'),
      icon: <LocalShippingIcon />,
      children: [
        {
          // Ohne `einsatzSection`: das Fahrtenbuch ist keine Einsatz-Ansicht, es
          // wird auch ohne laufenden Einsatz geführt. Der Weg in die
          // Einsatz-Sammelerfassung führt über den Button auf der
          // Fahrtenbuch-Seite.
          text: t('fahrtenbuch'),
          icon: <EditRoadIcon />,
          href: '/fahrtenbuch',
        },
        {
          // Eigener Menüpunkt und nicht nur ein Button im Fahrtenbuch: Die
          // Mängelliste ist die Arbeitsliste des Fahrzeugverantwortlichen und
          // wird unabhängig vom Erfassen einer Fahrt geöffnet.
          text: t('maengel'),
          icon: <BuildIcon />,
          href: '/fahrtenbuch/maengel',
        },
        {
          // Unter „Fahrzeuge" und nicht unter „Lage": Das Füllprotokoll ist
          // Gerätearbeit und hängt an keinem Einsatz. Der Sammelplatz bleibt
          // als eigener Punkt unter „Lage".
          //
          // Bewusst ohne `einsatzSection` — sonst leitete `resolveHref` bei
          // aktivem Einsatz auf die Einsatzseite um.
          text: t('fuellprotokoll'),
          icon: <PropaneTankIcon />,
          href: '/atemschutz/fuellprotokoll',
        },
        {
          // Neben dem Füllprotokoll und nicht unter „Verwaltung": Die
          // Verrechnung ist die Fortsetzung derselben Arbeit — was gefüllt
          // wurde, wird abgerechnet. Sichtbar nur mit der
          // Kostenersatz-Freischaltung.
          text: t('verrechnung'),
          icon: <ReceiptLongIcon />,
          href: '/atemschutz/verrechnung',
          kostenersatzOnly: true,
        },
      ],
    },
    {
      text: t('groupTools'),
      icon: <HandymanIcon />,
      children: [
        { text: t('blaulichtSms'), icon: <SmsIcon />, href: '/blaulicht-sms' },
        { text: t('kennzeichen'), icon: <PinIcon />, href: '/kennzeichen' },
        {
          // Eigener Menüpunkt: die Rettungskarte wird auch ohne vorherige
          // Kennzeichenabfrage gebraucht, etwa wenn nur das Fahrzeug vor
          // Augen ist.
          text: t('rettungskarten'),
          icon: <CarCrashIcon />,
          href: '/rettungskarten',
        },
        { text: t('ai'), icon: <AutoAwesomeIcon />, href: '/ai' },
      ],
    },
    {
      text: t('hazmat'),
      icon: <Icon path={mdiBiohazard} size={1} />,
      children: [
        {
          // Schadstoffdatenbank ist einsatzunabhängig — immer globaler Link.
          // Die einsatz-skopierte URL bleibt direkt erreichbar.
          text: t('hazmatDatabase'),
          icon: <BiotechIcon />,
          href: '/schadstoff/datenbank',
        },
        {
          // Strahlenschutzberechnung ist einsatzunabhängig — immer globaler Link.
          // Die einsatz-skopierte URL bleibt direkt erreichbar.
          text: t('radiationCalculator'),
          icon: <WarningIcon />,
          href: '/schadstoff/strahlenschutz',
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
    {
      text: t('admin'),
      icon: <AdminPanelSettingsIcon />,
      children: [
        // Tokens sind kein Admin-Recht: die Gruppe erscheint daher auch für
        // Nicht-Admins, dann mit diesem einen Eintrag.
        { text: t('tokens'), icon: <ApiIcon />, href: '/tokens' },
        // Wie die Tokens kein Admin-Recht: Jeder autorisierte Benutzer kann
        // eigene Anwendungen verbinden und muss sie auch wieder loswerden.
        {
          text: t('connectedApps'),
          icon: <SmartToyIcon />,
          href: '/verbundene-anwendungen',
          signedInOnly: true,
        },
        {
          text: t('adminMcp'),
          icon: <HubIcon />,
          href: '/admin/mcp',
          admin: true,
        },
        { text: t('users'), icon: <UserIcon />, href: '/users', admin: true },
        { text: t('groups'), icon: <GroupIcon />, href: '/groups', admin: true },
        {
          text: t('auditLog'),
          icon: <HistoryIcon />,
          href: '/auditlog',
          admin: true,
        },
        {
          text: t('adminActions'),
          icon: <BuildIcon />,
          href: '/admin/actions',
          admin: true,
        },
        {
          text: t('gisDataPipeline'),
          icon: <StorageIcon />,
          href: '/admin/gis-data',
          admin: true,
        },
        {
          text: t('hydrantClusters'),
          icon: <HubIcon />,
          href: '/admin/hydrant-clusters',
          admin: true,
        },
        {
          text: t('adminKostenersatz'),
          icon: <ReceiptLongIcon />,
          href: '/admin/kostenersatz',
          admin: true,
        },
        {
          text: t('adminFahrtenbuch'),
          icon: <EditRoadIcon />,
          href: '/admin/fahrtenbuch',
          fahrtenbuchAdmin: true,
        },
        {
          text: t('adminAtemschutz'),
          icon: <AirIcon />,
          href: '/admin/atemschutz',
          groupAdminOnly: true,
        },
        {
          text: t('adminDrive'),
          icon: <FolderSharedIcon />,
          href: '/admin/drive',
          admin: true,
        },
        {
          text: t('pegelstaende'),
          icon: <WavesIcon />,
          href: '/admin/pegelstaende',
          admin: true,
        },
        {
          text: t('deletedItems'),
          icon: <DeleteIcon />,
          href: '/admin/deleted-items',
          admin: true,
        },
        {
          text: t('hydrantCsvImport'),
          icon: <CloudUploadIcon />,
          href: '/admin/hydranten-csv-import',
          admin: true,
        },
        {
          text: t('bugReports'),
          icon: <BugReportIcon />,
          href: '/admin/bug-reports',
          admin: true,
        },
      ],
    },
    {
      text: t('groupHelpAccount'),
      icon: <HelpCenterIcon />,
      children: [
        {
          text: t('documentation'),
          icon: <HelpOutlineIcon />,
          href: '/docs',
        },
        {
          text: t('feedbackBugReport'),
          icon: <BugReportIcon />,
          href: '#',
          onClick: () => bugReport.open(),
        },
        {
          text: t('profile'),
          icon: <AccountCircleIcon />,
          href: '/profile',
          signedInOnly: true,
        },
        { text: t('about'), icon: <InfoIcon />, href: '/about' },
        { text: t('login'), icon: <LoginIcon />, href: '/login' },
      ],
    },
  ];

  const active = findActive(directItems, groups, firecallId, pathname ?? '');
  const activeGroup = active.group;

  // Der Aufklapp-Zustand wird zusammen mit der Gruppe gespeichert, für die er
  // gilt. Führt die aktuelle Seite in eine andere Gruppe, ist der gemerkte
  // Zustand ungültig und es gilt wieder „nur die aktive Gruppe offen".
  const [openState, setOpenState] = useState<{
    group?: string;
    open: Record<string, boolean>;
  }>({ open: {} });

  const openGroups =
    openState.group === activeGroup ? openState.open : defaultOpen(activeGroup);

  // Ohne useCallback: der React Compiler memoisiert selbst, und `activeGroup`
  // als Dependency kann er nicht als stabil nachweisen.
  const toggleGroup = (text: string) => {
    setOpenState((prev) => {
      const base =
        prev.group === activeGroup ? prev.open : defaultOpen(activeGroup);
      return { group: activeGroup, open: { ...base, [text]: !base[text] } };
    });
  };

  const isVisible = useCallback(
    (item: DrawerLink) =>
      (isAdmin || !item.admin) &&
      (!item.fahrtenbuchAdmin ||
        hasAnyFahrtenbuchManagerRole({
          isAdmin,
          fahrtenbuchGeraetemeister,
          groupAdmin,
        })) &&
      (!item.groupAdminOnly || hasAnyGroupAdminRole({ isAdmin, groupAdmin })) &&
      (!item.kostenersatzOnly || !!userGroups?.includes(KOSTENERSATZ_GROUP)) &&
      (isSignedIn || !item.signedInOnly),
    [isAdmin, isSignedIn, fahrtenbuchGeraetemeister, groupAdmin, userGroups],
  );

  const renderLink = (item: DrawerLink, groupText?: string) => {
    const sx = groupText ? { pl: 4 } : undefined;

    if (item.onClick) {
      return (
        <ListItemButton
          key={item.text}
          sx={sx}
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
    const selected = active.key === itemKey(item.text, groupText);

    return (
      <Link href={resolvedHref} passHref key={item.text}>
        <ListItemButton
          sx={sx}
          selected={selected}
          aria-current={selected ? 'page' : undefined}
          onClick={toggleDrawer}
        >
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText primary={item.text} />
        </ListItemButton>
      </Link>
    );
  };

  return (
    <div>
      <Drawer anchor="left" open={isOpen} onClose={toggleDrawer}>
        <Box sx={{ width: 250 }} role="presentation" onKeyDown={toggleDrawer}>
          <List>
            {directItems.filter(isVisible).map((item) => renderLink(item))}

            <Divider sx={{ my: 1 }} />

            {groups.map((group) => {
              const children = group.children.filter(isVisible);
              if (children.length === 0) return null;

              const open = !!openGroups[group.text];
              // Zugeklappt übernimmt der Gruppenkopf die Markierung, damit auch
              // dann sichtbar bleibt, wo man gerade steht.
              const marked = !open && activeGroup === group.text;

              return (
                <React.Fragment key={group.text}>
                  <ListItemButton
                    onClick={() => toggleGroup(group.text)}
                    selected={marked}
                    aria-current={marked ? true : undefined}
                  >
                    <ListItemIcon>{group.icon}</ListItemIcon>
                    <ListItemText primary={group.text} />
                    {open ? <ExpandLess /> : <ExpandMore />}
                  </ListItemButton>
                  <Collapse in={open} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {children.map((child) => renderLink(child, group.text))}
                    </List>
                  </Collapse>
                </React.Fragment>
              );
            })}
          </List>
        </Box>
      </Drawer>
    </div>
  );
}
