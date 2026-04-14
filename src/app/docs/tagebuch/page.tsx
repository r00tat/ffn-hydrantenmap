import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Screenshot from '../../../components/docs/Screenshot';

export default function TagebuchDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsatztagebuch
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Das Einsatztagebuch dokumentiert alle wichtigen Ereignisse während eines
        Einsatzes in chronologischer Reihenfolge. Es dient als lückenlose
        Aufzeichnung aller Meldungen, Befehle und Rückfragen im Einsatzverlauf.
      </Typography>

      <Screenshot
        src="/docs-assets/screenshots/tagebuch.png"
        alt="Einsatztagebuch"
      />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Einträge erstellen mit automatischem Zeitstempel" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Eintragsarten: M (Meldung), B (Befehl), F (Frage)"
            secondary="Klassifizierung nach dem Stabsarbeits-Schema"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Von/An Felder für Absender und Empfänger"
            secondary="Dokumentiert die Kommunikationswege im Einsatz"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Automatische Nummerierung der Einträge" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Chronologische Timeline mit Sortierung"
            secondary="Sortierbar nach Nummer, Datum, Art, Name und Beschreibung"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Automatische Fahrzeug-Einträge"
            secondary="Alarmierung, Eintreffen und Abrücken werden automatisch aus Fahrzeugdaten generiert"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="KI-gestützte Zusammenfassung"
            secondary="Automatische Zusammenfassung des gesamten Einsatzes basierend auf allen Tagebucheinträgen"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="CSV-Export des Tagebuchs" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einträge bearbeiten und löschen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Eintrag erstellen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Am Desktop steht ein Inline-Formular direkt in der Tabelle zur
        Verfügung. Auf Mobilgeräten nutzt du den FAB (Floating Action Button)
        unten rechts.
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Die Nummer wird automatisch vergeben und muss nicht eingegeben werden
          </li>
          <li>
            Wähle die Art des Eintrags: <strong>M</strong> (Meldung),{' '}
            <strong>B</strong> (Befehl) oder <strong>F</strong> (Frage)
          </li>
          <li>
            Fülle die Felder <strong>Von</strong> und <strong>An</strong> aus
            (Absender und Empfänger)
          </li>
          <li>
            Gib den <strong>Namen</strong> ein - das ist der Haupttext des
            Eintrags
          </li>
          <li>
            Optional: Ergänze eine <strong>Beschreibung</strong> mit
            zusätzlichen Details
          </li>
          <li>Klicke auf den Button, um den Eintrag zu speichern</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die Eintragsarten folgen dem Stabsarbeits-Schema: M = Meldung
        (Information), B = Befehl (Anweisung), F = Frage (Rückfrage).
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Einträge sortieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Klicke auf eine Spaltenüberschrift (Nummer, Datum, Art, Name oder
            Beschreibung)
          </li>
          <li>
            Ein Pfeil zeigt die aktuelle Sortierrichtung an (aufsteigend oder
            absteigend)
          </li>
          <li>
            Erneutes Klicken auf dieselbe Spalte kehrt die Sortierrichtung um
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        KI-Zusammenfassung erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Klicke auf den Button &quot;Zusammenfassung&quot; in der Toolbar
          </li>
          <li>
            Die KI analysiert automatisch alle Tagebucheinträge und generiert
            eine Zusammenfassung des gesamten Einsatzes
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Als CSV exportieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicke auf den Download-Button in der Toolbar</li>
          <li>
            Die CSV-Datei mit allen Tagebucheinträgen wird heruntergeladen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Eintrag bearbeiten oder löschen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Klicke auf das Bearbeiten-Symbol neben dem gewünschten Eintrag, um
            ihn zu ändern
          </li>
          <li>
            Klicke auf das Löschen-Symbol, um einen Eintrag zu entfernen
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Fahrzeug-Zeitstempel (Alarmierung, Eintreffen, Abrücken) werden
        automatisch als Tagebucheinträge generiert. Du musst diese nicht manuell
        anlegen.
      </Alert>
    </>
  );
}
