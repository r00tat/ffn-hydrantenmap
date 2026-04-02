import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function KiDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        KI-Assistent
      </Typography>
      <Typography paragraph>
        Der KI-Assistent nutzt künstliche Intelligenz, um Fragen zum aktuellen
        Einsatz zu beantworten, Zusammenfassungen zu erstellen und bei der
        Öffentlichkeitsarbeit zu unterstützen. Der Assistent hat Zugriff auf
        alle Daten des aktiven Einsatzes.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Fragen zum Einsatz stellen und KI-generierte Antworten erhalten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatz-Zusammenfassungen automatisch erstellen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Social-Media-Beiträge für Facebook/Instagram generieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Verschiedene Assistenten-Modi (Standard, Social Media)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Streaming-Antworten in Echtzeit" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Zugriff auf Einsatzdaten"
            secondary="Name, Datum, Beschreibung, Fahrzeuge, Personal, Tagebuch, Geschäftsbuch"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        KI-Assistent öffnen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;KI&quot; klicken</li>
          <li>Seite zeigt Eingabefeld und Assistenten-Auswahl</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Assistenten-Modus wählen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Dropdown &quot;Assistent&quot; verwenden
          </li>
          <li>
            <strong>Standard</strong> für allgemeine Fragen
          </li>
          <li>
            <strong>Social Media</strong> für Facebook/Instagram-Beiträge
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Frage stellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Frage oder Aufgabe in das Textfeld eingeben, z.B. &quot;Erstelle
            eine Zusammenfassung des Einsatzes&quot;
          </li>
          <li>Enter oder &quot;Fragen&quot; Button klicken</li>
          <li>Antwort wird in Echtzeit gestreamt</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Social-Media-Beiträge erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Modus auf &quot;Social Media&quot; wechseln</li>
          <li>
            z.B. &quot;Erstelle einen Facebook-Beitrag über den Einsatz&quot;
            eingeben
          </li>
          <li>KI generiert einen Beitrag mit passenden Hashtags und Ton</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Ergebnisse verwenden
      </Typography>
      <Typography component="div">
        <ol>
          <li>Antwort wird als formatierter Text angezeigt</li>
          <li>Text kann kopiert und weiterverwendet werden</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Der KI-Assistent hat automatisch Zugriff auf alle Daten des
        aktiven Einsatzes - du musst keine Details manuell eingeben.
      </Alert>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Im Social-Media-Modus erstellt die KI Beiträge mit passender
        Tonalität, Hashtags und Zielgruppenansprache für die
        Feuerwehr-Öffentlichkeitsarbeit.
      </Alert>

      <Alert severity="warning" sx={{ my: 2 }}>
        Hinweis: Ein aktiver Einsatz muss ausgewählt sein, damit der
        KI-Assistent Einsatzdaten verwenden kann.
      </Alert>
    </>
  );
}
