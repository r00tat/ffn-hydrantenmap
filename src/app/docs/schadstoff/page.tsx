import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function SchadstoffDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Schadstoff
      </Typography>
      <Typography paragraph>
        Die Schadstoffdatenbank enthält Informationen zu gefährlichen Stoffen
        und deren Handhabung im Einsatzfall.
      </Typography>

      <Screenshot src="/docs/screenshots/schadstoff.png" alt="Schadstoffdatenbank" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Gefahrstoffe suchen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Sicherheitsdatenblätter abrufen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gefahrenhinweise anzeigen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Gefahrstoff suchen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie die Schadstoffdatenbank</li>
          <li>Geben Sie den Stoffnamen oder die UN-Nummer ein</li>
          <li>Wählen Sie den Stoff aus der Ergebnisliste</li>
          <li>Lesen Sie die Gefahrenhinweise und Maßnahmen</li>
        </ol>
      </Typography>
    </>
  );
}
