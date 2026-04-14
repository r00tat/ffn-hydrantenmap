import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Screenshot from '../../../components/docs/Screenshot';

export default function FahrzeugeDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Fahrzeuge
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Verwalte die Fahrzeuge im Einsatz mit Besatzungsstärke, Zeitstempeln und
        Kartenpositionen. Die Fahrzeugverwaltung bildet die Grundlage für die
        Stärketabelle und erzeugt automatisch Tagebucheinträge.
      </Typography>

      <Screenshot
        src="/docs-assets/screenshots/fahrzeuge.png"
        alt="Fahrzeugübersicht"
      />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Fahrzeuge zum Einsatz hinzufügen"
            secondary="Mit Name, Feuerwehr und Besatzungsstärke"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Zeitstempel verwalten"
            secondary="Alarmierung, Eintreffen und Abrücken erfassen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Besatzungsstärke im Format '1:4'"
            secondary="Gruppenkommandant:Mannschaft - wird automatisch in die Stärketabelle übernommen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Atemschutzträger (ATS) Anzahl erfassen"
            secondary="Wird in der Stärketabelle separat ausgewiesen"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeugpositionen auf der Karte anzeigen und verschieben" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Stärketabelle mit Gesamt-Mannschaftsstärke"
            secondary="Automatische Berechnung der Gesamtstärke aller Fahrzeuge"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gruppierung nach Ebenen (Layer)" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="CSV-Export aller Fahrzeugdaten"
            secondary="Inklusive Timeline mit allen Zeitstempeln"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Automatische Tagebucheinträge"
            secondary="Bei Änderungen an Zeitstempeln werden automatisch Einträge im Einsatztagebuch erzeugt"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Fahrzeug hinzufügen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Aktiviere den Bearbeitungsmodus auf der Karte</li>
          <li>Klicke auf den Plus-Button und wähle den Fahrzeugtyp</li>
          <li>
            Gib den Namen ein, z.B. &quot;TLFA 2000&quot;
          </li>
          <li>Gib die Feuerwehr an, zu der das Fahrzeug gehört</li>
          <li>
            Trage die Besatzung im Format &quot;1:4&quot; ein
            (Gruppenkommandant:Mannschaft)
          </li>
          <li>Gib die Anzahl der Atemschutzträger (ATS) ein</li>
          <li>Speichere das Fahrzeug</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Das Besatzungsformat &quot;1:8&quot; bedeutet 1 Gruppenkommandant
        und 8 Mann. Die Stärketabelle berechnet daraus automatisch die
        Gesamtstärke.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Zeitstempel setzen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne das gewünschte Fahrzeug</li>
          <li>
            Trage Datum und Uhrzeit für <strong>Alarmierung</strong>,{' '}
            <strong>Eintreffen</strong> und <strong>Abrücken</strong> ein
          </li>
          <li>
            Die Zeitstempel werden automatisch als Einträge im
            Einsatztagebuch angelegt
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Wenn du Zeitstempel (Alarmierung, Eintreffen, Abrücken) änderst,
        werden automatisch entsprechende Einträge im Einsatztagebuch erzeugt.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Stärketabelle lesen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Oben auf der Fahrzeugseite wird die Stärketabelle angezeigt. Sie enthält
        die Gesamtzahl der Fahrzeuge, die Gesamtbesatzung und die Anzahl der
        ATS-Träger.
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Fahrzeug auf Karte positionieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Aktiviere den Bearbeitungsmodus</li>
          <li>
            Verschiebe das Fahrzeug per Drag &amp; Drop an die gewünschte
            Position auf der Karte
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Als CSV exportieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicke auf den Download-Button in der Fahrzeugübersicht</li>
          <li>
            Die CSV-Datei mit allen Fahrzeugdaten und Zeitstempeln wird
            heruntergeladen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Fahrzeuge nach Ebenen gruppieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Fahrzeuge können verschiedenen Ebenen (Layern) zugeordnet werden
          </li>
          <li>
            Die Gruppierung ermöglicht eine übersichtliche Darstellung bei
            größeren Einsätzen mit mehreren Abschnitten
          </li>
        </ol>
      </Typography>
    </>
  );
}
