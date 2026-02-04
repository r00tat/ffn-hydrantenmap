import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Link from 'next/link';

export default function DocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Dokumentation
      </Typography>
      <Typography paragraph>
        Willkommen zur Dokumentation der Einsatzkarte. Hier findest du Anleitungen
        zu allen Funktionen der App.
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Inhalt
      </Typography>
      <List>
        <ListItem>
          <Link href="/docs/quickstart" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Schnellstart"
              secondary="In wenigen Schritten einen Einsatz anlegen"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/karte" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Karte"
              secondary="Hydranten anzeigen, navigieren, Layer verwalten"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/einsaetze" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Einsätze"
              secondary="Einsätze erstellen, bearbeiten und verwalten"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/tagebuch" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Einsatztagebuch"
              secondary="Einträge im Einsatztagebuch erstellen und ansehen"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/fahrzeuge" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Fahrzeuge"
              secondary="Fahrzeugpositionen und Status verwalten"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/schadstoff" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Schadstoff"
              secondary="Gefahrstoffdatenbank durchsuchen"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/kostenersatz" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Kostenersatz"
              secondary="Abrechnungen erstellen und exportieren"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/geschaeftsbuch" style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
            <ListItemText
              primary="Geschäftsbuch"
              secondary="Geschäftsbucheinträge verwalten"
            />
          </Link>
        </ListItem>
      </List>
    </>
  );
}
