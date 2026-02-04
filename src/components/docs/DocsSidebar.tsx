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
  { label: 'Schadstoff', href: '/docs/schadstoff' },
  { label: 'Kostenersatz', href: '/docs/kostenersatz' },
  { label: 'Geschäftsbuch', href: '/docs/geschaeftsbuch' },
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
