import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function TagebuchDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsatztagebuch
      </Typography>
      <Typography paragraph>
        Das Einsatztagebuch dokumentiert alle wichtigen Ereignisse während eines
        Einsatzes in chronologischer Reihenfolge.
      </Typography>

      <Screenshot src="/docs/screenshots/tagebuch.png" alt="Einsatztagebuch" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Einträge erstellen mit Zeitstempel" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Chronologische Timeline ansehen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einträge filtern und suchen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Eintrag erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie das Einsatztagebuch</li>
          <li>Klicken Sie auf &quot;Neuer Eintrag&quot;</li>
          <li>Geben Sie die Beschreibung des Ereignisses ein</li>
          <li>Der Zeitstempel wird automatisch gesetzt</li>
          <li>Speichern Sie den Eintrag</li>
        </ol>
      </Typography>
    </>
  );
}
