import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function EinsatzorteDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsatzorte
      </Typography>
      <Typography paragraph>
        Einsatzorte dienen zur Verwaltung einzelner Einsatzstellen innerhalb
        eines Einsatzes. Jeder Ort hat einen Status, zugewiesene Fahrzeuge und
        Zeitstempel für die Einsatzabwicklung.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Einsatzorte erstellen mit Adresse und Beschreibung" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Status-Verwaltung mit Farbcodierung"
            secondary="Offen (gelb), Einsatz notwendig (rot), In Arbeit (orange), Erledigt (grün), Kein Einsatz (grün)"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Fahrzeuge pro Einsatzort zuweisen"
            secondary="Aus Karten-Fahrzeugen oder Kostenersatz-Vorschlägen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Zeitstempel"
            secondary="Alarmzeit, Startzeit, Zeitpunkt abgearbeitet"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Automatischer E-Mail-Import von Einsatzorten"
            secondary="Für FFN-Gruppe, alle 60 Sekunden"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Deduplizierung über Auftragsnummer" />
        </ListItem>
        <ListItem>
          <ListItemText primary="GPS-Koordinaten und Kartenansicht" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Sortierung nach allen Spalten" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Responsive Darstellung"
            secondary="Tabelle (Desktop) oder Karten (Mobil)"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Einsatzort erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Neuen Einsatzort anlegen</li>
          <li>Name und Adresse eingeben</li>
          <li>Status setzen</li>
          <li>Speichern</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Status ändern
      </Typography>
      <Typography component="div">
        <ol>
          <li>Dropdown in der Status-Spalte klicken</li>
          <li>
            Neuen Status wählen &ndash; die Farbe ändert sich automatisch
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die Statusfarben helfen bei der schnellen Übersicht: Rot =
        dringend, Orange = in Bearbeitung, Grün = erledigt.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Fahrzeuge zuweisen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Fahrzeug-Dropdown am Einsatzort öffnen</li>
          <li>Fahrzeug aus Liste wählen oder neues erstellen</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        E-Mail-Import nutzen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            E-Mail-Check Button klicken oder automatisch alle 60 Sekunden
            warten
          </li>
          <li>Neue Einsatzorte erscheinen mit Badge-Anzeige</li>
          <li>
            Bestehende Aufträge werden über die Auftragsnummer erkannt und
            nicht doppelt importiert
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Der E-Mail-Import funktioniert automatisch im Hintergrund (alle
        60 Sekunden) und erstellt bei neuen Einsatzorten auch einen
        Tagebucheintrag.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Zeitstempel verwalten
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Alarmzeit, Startzeit und Abgearbeitet-Zeit pro Einsatzort setzen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Sortieren und filtern
      </Typography>
      <Typography component="div">
        <ol>
          <li>Spaltenüberschriften klicken für Sortierung</li>
        </ol>
      </Typography>
    </>
  );
}
