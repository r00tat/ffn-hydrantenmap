import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function KarteDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Karte
      </Typography>
      <Typography paragraph>
        Die Karte zeigt Hydranten und andere wichtige Punkte im Einsatzgebiet an.
        Sie können die Karte verschieben, zoomen und verschiedene Layer aktivieren.
      </Typography>

      <Screenshot src="/docs/screenshots/karte.png" alt="Kartenansicht" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Hydranten anzeigen und Details abrufen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Karte verschieben und zoomen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Verschiedene Kartenlayer aktivieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Standort suchen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Hydranten anzeigen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie die Karte über das Menü oder die Startseite</li>
          <li>Hydranten werden als blaue Marker angezeigt</li>
          <li>Klicken Sie auf einen Hydranten für Details</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Layer wechseln
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicken Sie auf das Layer-Symbol rechts oben</li>
          <li>Wählen Sie den gewünschten Kartenlayer aus</li>
          <li>Aktivieren oder deaktivieren Sie Overlays nach Bedarf</li>
        </ol>
      </Typography>
    </>
  );
}
