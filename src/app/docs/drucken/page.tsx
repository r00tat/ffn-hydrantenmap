import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function DruckenDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Drucken
      </Typography>
      <Typography paragraph>
        Die Druckfunktion erstellt einen umfassenden Einsatzbericht, der alle
        relevanten Daten des aktiven Einsatzes in einem druckoptimierten Format
        zusammenfasst.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Einsatz-Kopfdaten: Name, Datum, Feuerwehr, Beschreibung" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatzkarte als eingebettete Karte" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatzmittel-Zusammenfassung: Erste Alarmierung, Erstes Eintreffen, Letztes Abrücken" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatzmittel-Details: Typ, Name, Details, Position (nach Ebenen gruppiert)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatzorte mit Status, Adressen, Zeiten und Fahrzeugen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Messwerte (Spektrum/Strahlungsdaten) falls vorhanden" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatztagebuch-Einträge" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Geschäftsbuch-Einträge" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Druckoptimiertes CSS-Layout mit Seitenumbrüchen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Druckansicht öffnen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;Drucken&quot; klicken</li>
          <li>Seite zeigt den vollständigen Einsatzbericht</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Bericht überprüfen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Alle Abschnitte durchsehen: Kopfdaten, Karte, Einsatzmittel,
            Einsatzorte, Messwerte, Tagebuch, Geschäftsbuch
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Messwerte ein/ausblenden
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Checkboxen verwenden um einzelne Messwerte in den Druck aufzunehmen
            oder auszuschließen
          </li>
          <li>Checkboxen sind nur am Bildschirm sichtbar</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Drucken
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Browser-Druckfunktion verwenden: Strg+P / Cmd+P
          </li>
          <li>Druckvorschau zeigt das optimierte Layout</li>
          <li>Als PDF speichern oder direkt drucken</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die Druckansicht ist für DIN-A4-Hochformat optimiert. Verwende die
        &quot;Als PDF speichern&quot;-Option im Druckdialog für eine digitale
        Kopie.
      </Alert>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Abschnitte ohne Daten (z.B. leeres Tagebuch) werden automatisch
        ausgeblendet.
      </Alert>
    </>
  );
}
