import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Screenshot from '../../../components/docs/Screenshot';

export default function GeschaeftsbuchDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Geschäftsbuch
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Das Geschäftsbuch dient zur Dokumentation aller offiziellen Vorgänge
        und Protokolle der Feuerwehr.
      </Typography>

      <Screenshot src="/docs-assets/screenshots/geschaeftsbuch.png" alt="Geschäftsbuch" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Eingehende und ausgehende Vorgänge dokumentieren"
            secondary="Ein/Aus Toggle"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Automatische fortlaufende Nummerierung" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Von/An Felder"
            secondary="Absender und Empfänger erfassen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Weiterleitung an Stabsfunktionen (S1-S6)"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Tabs nach Stabsfunktionen"
            secondary="Alle Einträge, S1 Personal, S2 Lage, S3 Einsatz, S4 Versorgung, S5 Öffentlichkeitsarbeit, S6 Kommunikation"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gelesen-Markierung pro Stabsfunktion" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Erledigt-Zeitstempel" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Sortierung nach allen Spalten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="CSV-Export" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        1. Eintrag erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Nummer wird automatisch vergeben</li>
          <li>Ein/Aus wählen (eingehend oder ausgehend)</li>
          <li>Von/An ausfüllen</li>
          <li>Name = Betreff/Information eingeben</li>
          <li>Beschreibung optional ergänzen</li>
          <li>
            Weiterleitung/Auszeichnung eingeben (z.B. &quot;S1, S3&quot;)
          </li>
          <li>Hinzufügen klicken</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Nutze &quot;Ein&quot; für eingehende Nachrichten (z.B.
        Lagemeldungen) und &quot;Aus&quot; für ausgehende Befehle oder
        Informationen.
      </Alert>

      <Typography variant="h6" gutterBottom>
        2. Nach Stabsfunktion filtern
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Tabs oben wählen: S1-S6 zeigen nur relevante Einträge basierend
            auf dem Weiterleitungsfeld
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die S-Funktionen (S1-S6) entsprechen den Stabsfunktionen im
        Einsatzstab. Einträge mit &quot;S1, S3&quot; in der Weiterleitung
        erscheinen in beiden Tabs.
      </Alert>

      <Typography variant="h6" gutterBottom>
        3. Als gelesen markieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Häkchen-Symbol pro Eintrag klicken, markiert den Eintrag für die
            eigene Funktion als gelesen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom>
        4. Eintrag als erledigt markieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Erledigt-Zeitstempel setzen</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom>
        5. Sortieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Klick auf Spaltenüberschrift: Nummer, Datum, Von/An, Name,
            Beschreibung, Erledigt
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom>
        6. Als CSV exportieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Download-Button klicken</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom>
        7. Eintrag bearbeiten/löschen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Eintrag in der Tabelle anklicken, um ihn zu bearbeiten</li>
          <li>Änderungen vornehmen und speichern oder Eintrag löschen</li>
        </ol>
      </Typography>
    </>
  );
}
