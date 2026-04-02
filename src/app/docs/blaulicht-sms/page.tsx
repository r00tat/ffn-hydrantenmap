import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function BlaulichtSmsDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Blaulicht-SMS
      </Typography>
      <Typography paragraph>
        Die Blaulicht-SMS Integration zeigt eingehende Alarmierungen der
        Feuerwehr an. Du siehst aktive und vergangene Alarme mit Details zu den
        alarmierten Funktionen und Teilnehmern.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Aktive Einsätze und vergangene Alarme anzeigen" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Details pro Alarm"
            secondary="Titel, Alarmzeit, Endzeit, Ersteller, Gruppen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Funktionen und Teilnehmer mit farbcodierten Chips"
            secondary="z.B. AT (Atemschutz), GF (Gruppenführer)"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Teilnehmer nach Funktion filtern (Chip anklicken)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Alarmort auf eingebetteter Karte anzeigen" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Integration beim Erstellen neuer Einsätze"
            secondary="Automatische Datenübernahme aus Blaulicht-SMS Alarmen"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Alarme anzeigen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;Blaulicht-SMS&quot; klicken</li>
          <li>
            Seite zeigt &quot;Aktive Einsätze&quot; und &quot;Vergangene
            Alarme&quot;
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Alarm-Details lesen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Jede Alarmkarte zeigt: Titel, Alarmzeit, Endzeit, Ersteller,
            beteiligte Gruppen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Funktionen und Teilnehmer ansehen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Farbige Chips zeigen Funktionstypen wie AT (Atemschutz), GF
            (Gruppenführer) mit Teilnehmeranzahl
          </li>
          <li>
            Auf Chip klicken filtert die Teilnehmerliste nach dieser Funktion
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Alarm-Karte ansehen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Wenn der Alarm Koordinaten hat, wird der Alarmort auf einer
            eingebetteten Karte angezeigt
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Alarm bei Einsatz-Erstellung nutzen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Beim Anlegen eines neuen Einsatzes: wenn die Gruppe
            Blaulicht-SMS-Zugangsdaten hat, erscheint ein Dropdown mit aktuellen
            Alarmen
          </li>
          <li>
            Alarm auswählen übernimmt automatisch die Einsatzdaten
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die Blaulicht-SMS Zugangsdaten werden pro Gruppe im
        Admin-Bereich konfiguriert.
      </Alert>

      <Alert severity="warning" sx={{ my: 2 }}>
        Hinweis: Ohne hinterlegte Zugangsdaten für die aktuelle Gruppe werden
        keine Alarme angezeigt.
      </Alert>
    </>
  );
}
