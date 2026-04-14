import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function EbenenDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Ebenen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Ebenen ermöglichen es, Einsatzelemente auf der Karte zu gruppieren und
        zu organisieren. Jede Ebene kann eigene Einstellungen für Sichtbarkeit,
        Darstellung und Datenfelder haben.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Eigene Ebenen erstellen und benennen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Elemente per Drag & Drop zwischen Ebenen verschieben" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Reihenfolge der Ebenen per Drag & Drop ändern"
            secondary="Beeinflusst die Darstellungsreihenfolge auf der Karte"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Sichtbarkeit pro Ebene ein/ausschalten"
            secondary="Über die Einstellung defaultVisible steuerbar"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Z-Index für Darstellungsreihenfolge festlegen" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Benutzerdefinierte Datenfelder (Data Schema)"
            secondary="Mit Typen: Zahl, Text, Boolean, Berechnet"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Heatmap-Visualisierung konfigurieren" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Interpolations-Darstellung"
            secondary="IDW - Inverse Distance Weighting"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Ebenen importieren und exportieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Labels anzeigen/verstecken" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gruppierung und Zusammenfassung konfigurieren" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Neue Ebene erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>FAB (Floating Action Button) unten rechts klicken</li>
          <li>Name für die Ebene eingeben</li>
          <li>Einstellungen festlegen (Sichtbarkeit, Z-Index, etc.)</li>
          <li>Speichern</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Elemente zuordnen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Element per Drag &amp; Drop auf die gewünschte Ebene ziehen</li>
          <li>Ein grüner Rahmen zeigt das Ziel an</li>
          <li>Loslassen zum Zuweisen</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Nicht zugeordnete Elemente erscheinen in der Spalte
        &quot;Elemente nicht zugeordnet&quot; und können von dort auf Ebenen
        gezogen werden.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Ebenen-Reihenfolge ändern
      </Typography>
      <Typography component="div">
        <ol>
          <li>Drag-Handle links an der Ebene greifen</li>
          <li>Nach oben oder unten ziehen</li>
          <li>Höhere Position = weiter oben dargestellt</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Datenfelder definieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Ebene bearbeiten</li>
          <li>Data Schema öffnen</li>
          <li>
            Feld hinzufügen mit Name und Typ: number, text, boolean oder
            computed
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Heatmap konfigurieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Ebene bearbeiten</li>
          <li>Heatmap aktivieren</li>
          <li>Datenfeld für die Visualisierung wählen</li>
          <li>Farbmodus auto oder manuell einstellen</li>
          <li>Radius und Blur anpassen</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Interpolation verwenden
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Visualisierungsmodus auf &quot;Interpolation&quot; stellen
          </li>
          <li>Radius in Metern festlegen</li>
          <li>Transparenz einstellen</li>
          <li>Algorithmus und Farbskala konfigurieren</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Heatmaps eignen sich besonders für Messwerte (z.B.
        Strahlungswerte, Pegelstände). Die Interpolation berechnet Werte
        zwischen den Messpunkten.
      </Alert>
    </>
  );
}
