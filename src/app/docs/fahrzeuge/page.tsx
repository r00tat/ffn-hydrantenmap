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
        Verwalten Sie die Fahrzeuge der Feuerwehr und deren aktuelle Positionen
        und Status.
      </Typography>

      <Screenshot src="/docs/screenshots/fahrzeuge.png" alt="Fahrzeugübersicht" />

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
          <li>Öffnen Sie die Fahrzeugübersicht</li>
          <li>Wählen Sie das Fahrzeug aus</li>
          <li>Ändern Sie den Status (verfügbar, im Einsatz, etc.)</li>
          <li>Speichern Sie die Änderung</li>
        </ol>
      </Typography>
    </>
  );
}
