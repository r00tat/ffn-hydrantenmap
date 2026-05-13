import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function AdminDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Administration
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Der Admin-Bereich bietet erweiterte Verwaltungsfunktionen für
        Administratoren. Hier können Benutzer verwaltet, Daten importiert und
        Systemeinstellungen konfiguriert werden.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Benutzerverwaltung: Benutzer anzeigen, Berechtigungen setzen, Custom Claims vergeben" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gruppenverwaltung: Gruppen erstellen und verwalten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Admin-Aktionen: Datenbank-Wartung, Benutzer-Reparatur, Daten zwischen Umgebungen kopieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="GIS-Daten-Pipeline: HAR-Dateien importieren und Geodaten verarbeiten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Hydranten-Cluster: Hydrantendaten verwalten und clustern" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Hydranten CSV-Import: Hydrantendaten aus CSV-Dateien importieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Kostenersatz-Einstellungen: Tarife und Vorlagen konfigurieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Pegelstände: Messstationen konfigurieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gelöschte Elemente: Gelöschte Daten wiederherstellen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Audit-Log: Alle Systemänderungen nachverfolgen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Benutzerverwaltung
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Benutzer verwalten
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;Users&quot; klicken</li>
          <li>Liste aller registrierten Benutzer</li>
          <li>
            Berechtigungen (isAuthorized, isAdmin) setzen
          </li>
          <li>Custom Claims für spezielle Zugriffsrechte vergeben</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Gruppen verwalten
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;Groups&quot; klicken</li>
          <li>Gruppen erstellen/bearbeiten/löschen</li>
          <li>
            Alarm-SMS-Zugangsdaten pro Gruppe hinterlegen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Admin-Dashboard
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Admin-Aktionen ausführen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;Admin&quot; klicken</li>
          <li>
            Tab &quot;Admin Actions&quot;: Benutzer-Berechtigungen reparieren
          </li>
          <li>Leere Einsatz-Gruppen korrigieren</li>
          <li>Custom Claims setzen</li>
          <li>Daten zwischen Dev und Prod kopieren</li>
          <li>Verwaiste Elemente finden und bereinigen</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        GIS-Daten importieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Tab &quot;GIS Data Pipeline&quot;: HAR-Datei hochladen
          </li>
          <li>Ortschaft und Collection wählen</li>
          <li>
            Daten werden geparst, Koordinaten konvertiert und in Vorschau
            angezeigt
          </li>
          <li>Import starten</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Hydranten per CSV importieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Tab &quot;Hydranten CSV Import&quot;: CSV-Datei hochladen
          </li>
          <li>Spalten-Mapping konfigurieren</li>
          <li>Vorschau prüfen</li>
          <li>Import durchführen</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Kostenersatz konfigurieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Tab &quot;Kostenersatz&quot;: Tarife und Stundensätze nach
            Tarifordnung einstellen
          </li>
          <li>Fahrzeug-spezifische Kosten definieren</li>
          <li>E-Mail-Vorlagen konfigurieren</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Pegelstand-Stationen verwalten
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Tab &quot;Pegelstände&quot;: Messstationen registrieren und Parameter
            konfigurieren
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Gelöschte Elemente wiederherstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Tab &quot;Gelöschte Elemente&quot;: Gelöschte Einsatzelemente
            durchsuchen
          </li>
          <li>
            Einzelne Elemente wiederherstellen oder endgültig löschen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Audit-Log
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Änderungen nachverfolgen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Im Menü auf &quot;Audit Log&quot; klicken</li>
          <li>
            Zeigt alle Systemänderungen: Wer hat wann was geändert
          </li>
          <li>Nach Benutzer und Aktion filtern</li>
        </ol>
      </Typography>

      <Alert severity="warning" sx={{ my: 2 }}>
        Hinweis: Der Admin-Bereich ist nur für Benutzer mit
        Administrator-Berechtigung sichtbar.
      </Alert>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Verwende die Admin-Aktionen &quot;Daten kopieren&quot; um Daten
        zwischen der Entwicklungs- und Produktionsumgebung zu synchronisieren.
      </Alert>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Das Audit-Log hilft bei der Nachverfolgung von Änderungen und kann
        zur Qualitätssicherung genutzt werden.
      </Alert>
    </>
  );
}
