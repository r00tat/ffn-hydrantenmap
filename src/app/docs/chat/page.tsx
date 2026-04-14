import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function ChatDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Chat
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Der Chat ermöglicht die Echtzeit-Kommunikation zwischen allen
        Einsatzkräften während eines Einsatzes. Nachrichten werden dem aktiven
        Einsatz zugeordnet und sind für alle Beteiligten sichtbar.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Echtzeit-Nachrichten senden und empfangen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Push-Benachrichtigungen für neue Nachrichten (via Firebase Cloud Messaging)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Chat-Benachrichtigungen ein/ausschalten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Nachrichten mit Absender und Zeitstempel" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Automatische Zuordnung zum aktiven Einsatz" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Chat öffnen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;Chat&quot; klicken</li>
          <li>Der Chat zeigt Nachrichten des aktiven Einsatzes</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Nachricht senden
      </Typography>
      <Typography component="div">
        <ol>
          <li>Text in das Eingabefeld eingeben</li>
          <li>Enter-Taste drücken oder Senden-Button klicken</li>
          <li>Nachricht erscheint sofort für alle Teilnehmer</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Benachrichtigungen aktivieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Schalter &quot;Chat Benachrichtigungen&quot; oben im Chat aktivieren
          </li>
          <li>
            Bei neuen Nachrichten erhältst du eine Push-Benachrichtigung
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Benachrichtigungen deaktivieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Schalter wieder ausschalten, wenn du nicht mehr benachrichtigt werden
            möchtest
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Chat-Nachrichten sind immer dem aktiven Einsatz zugeordnet.
        Wechsle den Einsatz, um den Chat eines anderen Einsatzes zu sehen.
      </Alert>

      <Alert severity="warning" sx={{ my: 2 }}>
        Hinweis: Für Push-Benachrichtigungen muss die App die Berechtigung für
        Benachrichtigungen haben. Erlaube Benachrichtigungen im Browser oder auf
        dem Mobilgerät.
      </Alert>
    </>
  );
}
