'use client';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const docPages = [
  { label: 'Übersicht', href: '/docs' },
  { label: 'Schnellstart', href: '/docs/quickstart' },
  { label: 'Karte', href: '/docs/karte' },
  { label: 'Einsätze', href: '/docs/einsaetze' },
  { label: 'Tagebuch', href: '/docs/tagebuch' },
  { label: 'Fahrzeuge', href: '/docs/fahrzeuge' },
  { label: 'Einsatzmittel', href: '/docs/einsatzmittel' },
  { label: 'Einsatzorte', href: '/docs/einsatzorte' },
  { label: 'Ebenen', href: '/docs/ebenen' },
  { label: 'Chat', href: '/docs/chat' },
  { label: 'KI-Assistent', href: '/docs/ki' },
  { label: 'Blaulicht-SMS', href: '/docs/blaulicht-sms' },
  { label: 'Schadstoff', href: '/docs/schadstoff' },
  { label: 'Energiespektrum', href: '/docs/energiespektrum' },
  { label: 'Kostenersatz', href: '/docs/kostenersatz' },
  { label: 'Geschäftsbuch', href: '/docs/geschaeftsbuch' },
  { label: 'Wetter', href: '/docs/wetter' },
  { label: 'Drucken', href: '/docs/drucken' },
  { label: 'Administration', href: '/docs/admin' },
];

export default function DocsSidebar() {
  const pathname = usePathname();

  return (
    <Paper
      sx={{
        width: 220,
        flexShrink: 0,
        height: 'fit-content',
        position: 'sticky',
        top: 16,
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">Dokumentation</Typography>
      </Box>
      <List component="nav" dense>
        {docPages.map(({ label, href }) => (
          <Link href={href} key={href} passHref style={{ textDecoration: 'none' }}>
            <ListItemButton selected={pathname === href}>
              <ListItemText primary={label} />
            </ListItemButton>
          </Link>
        ))}
      </List>
    </Paper>
  );
}
