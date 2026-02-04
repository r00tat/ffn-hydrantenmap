import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function FahrzeugeDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Fahrzeuge
      </Typography>
      <Typography paragraph>
        Verwalte die Fahrzeuge der Feuerwehr und deren aktuelle Positionen
        und Status.
      </Typography>

      <Screenshot src="/docs-assets/screenshots/fahrzeuge.png" alt="Fahrzeugübersicht" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Fahrzeugpositionen auf der Karte anzeigen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeugstatus aktualisieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeugdetails einsehen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Fahrzeugstatus aktualisieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne die Fahrzeugübersicht</li>
          <li>Wähle das Fahrzeug aus</li>
          <li>Ändere den Status (verfügbar, im Einsatz, etc.)</li>
          <li>Speichere die Änderung</li>
        </ol>
      </Typography>
    </>
  );
}
