import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function EinsatzmittelDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsatzmittel
      </Typography>
      <Typography paragraph>
        Die Einsatzmittel-Seite bietet eine Übersicht aller im Einsatz
        eingesetzten Fahrzeuge und Ressourcen mit Stärkeberechnung und
        Gruppenansicht.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Übersicht aller eingesetzten Fahrzeuge und Ressourcen" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Stärketabelle"
            secondary="Mit Gesamtbesatzung und Atemschutzträger (ATS)"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gruppierung nach Ebenen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Kompakte Kartenansicht pro Fahrzeug" />
        </ListItem>
        <ListItem>
          <ListItemText primary="CSV-Export aller Einsatzmittel" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeuge bearbeiten und Details einsehen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Drag & Drop für Ebenenzuordnung" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Einsatzmittel-Übersicht öffnen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Im Menü auf &quot;Einsatzmittel&quot; klicken
          </li>
          <li>Die Seite zeigt alle Fahrzeuge des aktiven Einsatzes</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Stärketabelle lesen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Oben auf der Seite: Gesamtzahl Fahrzeuge, Gesamtbesatzung,
            ATS-Träger
          </li>
          <li>
            Wird automatisch aus allen Fahrzeugdaten berechnet
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die Stärketabelle aktualisiert sich automatisch, wenn Fahrzeuge
        hinzugefügt oder Besatzungsstärken geändert werden.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Fahrzeuge nach Ebenen ansehen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Fahrzeuge sind nach Ebenen gruppiert</li>
          <li>Jede Gruppe ist auf- und zuklappbar</li>
          <li>
            &quot;Nicht zugeordnet&quot; enthält Fahrzeuge ohne Ebene
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Fahrzeug bearbeiten
      </Typography>
      <Typography component="div">
        <ol>
          <li>Fahrzeugkarte aufklappen</li>
          <li>Bearbeiten-Button klicken</li>
          <li>Details ändern und speichern</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Als CSV exportieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Download-Button oben rechts klicken</li>
          <li>
            Die CSV-Datei enthält alle Fahrzeugdaten mit Timeline
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die Einsatzmittel-Seite zeigt die gleichen Fahrzeuge wie die
        Fahrzeug-Seite, bietet aber eine kompaktere Übersicht mit
        Stärkeberechnung.
      </Alert>
    </>
  );
}
