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
        Willkommen zur Dokumentation der Einsatzkarte. Hier finden Sie Anleitungen
        zu allen Funktionen der App.
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Inhalt
      </Typography>
      <List>
        <ListItem component={Link} href="/docs/karte">
          <ListItemText
            primary="Karte"
            secondary="Hydranten anzeigen, navigieren, Layer verwalten"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/einsaetze">
          <ListItemText
            primary="Einsätze"
            secondary="Einsätze erstellen, bearbeiten und verwalten"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/tagebuch">
          <ListItemText
            primary="Einsatztagebuch"
            secondary="Einträge im Einsatztagebuch erstellen und ansehen"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/fahrzeuge">
          <ListItemText
            primary="Fahrzeuge"
            secondary="Fahrzeugpositionen und Status verwalten"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/schadstoff">
          <ListItemText
            primary="Schadstoff"
            secondary="Gefahrstoffdatenbank durchsuchen"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/kostenersatz">
          <ListItemText
            primary="Kostenersatz"
            secondary="Abrechnungen erstellen und exportieren"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/geschaeftsbuch">
          <ListItemText
            primary="Geschäftsbuch"
            secondary="Geschäftsbucheinträge verwalten"
          />
        </ListItem>
      </List>
    </>
  );
}
