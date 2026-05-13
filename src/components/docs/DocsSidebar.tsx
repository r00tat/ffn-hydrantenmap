'use client';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const docPages = [
  { key: 'overview', href: '/docs' },
  { key: 'quickstart', href: '/docs/quickstart' },
  { key: 'karte', href: '/docs/karte' },
  { key: 'einsaetze', href: '/docs/einsaetze' },
  { key: 'tagebuch', href: '/docs/tagebuch' },
  { key: 'fahrzeuge', href: '/docs/fahrzeuge' },
  { key: 'einsatzmittel', href: '/docs/einsatzmittel' },
  { key: 'einsatzorte', href: '/docs/einsatzorte' },
  { key: 'ebenen', href: '/docs/ebenen' },
  { key: 'chat', href: '/docs/chat' },
  { key: 'ki', href: '/docs/ki' },
  { key: 'blaulichtSms', href: '/docs/blaulicht-sms' },
  { key: 'schadstoff', href: '/docs/schadstoff' },
  { key: 'strahlenschutz', href: '/docs/strahlenschutz' },
  { key: 'energiespektrum', href: '/docs/energiespektrum' },
  { key: 'kostenersatz', href: '/docs/kostenersatz' },
  { key: 'geschaeftsbuch', href: '/docs/geschaeftsbuch' },
  { key: 'wetter', href: '/docs/wetter' },
  { key: 'drucken', href: '/docs/drucken' },
  { key: 'admin', href: '/docs/admin' },
] as const;

export default function DocsSidebar() {
  const pathname = usePathname();
  const t = useTranslations('docsNav');

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
        <Typography variant="h6">{t('heading')}</Typography>
      </Box>
      <List component="nav" dense>
        {docPages.map(({ key, href }) => (
          <Link href={href} key={href} passHref style={{ textDecoration: 'none' }}>
            <ListItemButton selected={pathname === href}>
              <ListItemText primary={t(key)} />
            </ListItemButton>
          </Link>
        ))}
      </List>
    </Paper>
  );
}
