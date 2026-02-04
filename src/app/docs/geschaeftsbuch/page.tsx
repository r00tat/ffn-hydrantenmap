import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function GeschaeftsbuchDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Geschäftsbuch
      </Typography>
      <Typography paragraph>
        Das Geschäftsbuch dient zur Dokumentation aller offiziellen Vorgänge
        und Protokolle der Feuerwehr.
      </Typography>

      <Screenshot src="/docs/screenshots/geschaeftsbuch.png" alt="Geschäftsbuch" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Einträge erstellen und verwalten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Protokolle dokumentieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einträge suchen und filtern" />
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
          <li>Öffne das Geschäftsbuch</li>
          <li>Klicke auf &quot;Neuer Eintrag&quot;</li>
          <li>Gib die Details des Vorgangs ein</li>
          <li>Speichere den Eintrag</li>
        </ol>
      </Typography>
    </>
  );
}
