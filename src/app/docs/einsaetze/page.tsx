import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function EinsaetzeDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsätze
      </Typography>
      <Typography paragraph>
        Hier kannst du Einsätze erstellen, bearbeiten und verwalten. Jeder Einsatz
        kann mit Fahrzeugen, Mannschaft und anderen Elementen verknüpft werden.
      </Typography>

      <Screenshot src="/docs/screenshots/einsaetze.png" alt="Einsatzübersicht" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Neue Einsätze anlegen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatzdetails bearbeiten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeuge und Mannschaft zuweisen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsätze abschließen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Neuen Einsatz anlegen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicke auf &quot;Neuer Einsatz&quot;</li>
          <li>Gib die Einsatzdaten ein (Adresse, Art, Zeit)</li>
          <li>Speichere den Einsatz</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Elemente hinzufügen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne einen bestehenden Einsatz</li>
          <li>Wähle den Elementtyp (Fahrzeug, Person, etc.)</li>
          <li>Füge das Element mit den entsprechenden Daten hinzu</li>
        </ol>
      </Typography>
    </>
  );
}
