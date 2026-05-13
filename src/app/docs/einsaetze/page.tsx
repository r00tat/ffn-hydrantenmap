import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Screenshot from '../../../components/docs/Screenshot';

export default function EinsaetzeDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsätze
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Hier kannst du Einsätze erstellen, bearbeiten und verwalten. Jeder
        Einsatz kann mit Fahrzeugen, Mannschaft und anderen Elementen verknüpft
        werden. Du kannst Einsätze per Link teilen, nach Gruppen filtern und
        Daten exportieren oder importieren.
      </Typography>

      <Screenshot
        src="/docs-assets/screenshots/einsaetze.png"
        alt="Einsatzübersicht"
      />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Neue Einsätze anlegen"
            secondary="Mit allen Details wie Name, Adresse, Alarmierung, Eintreffen und Abrücken"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Einsatzdetails bearbeiten"
            secondary="Name, Adresse, Alarmierung, Eintreffen, Abrücken und weitere Felder ändern"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Fahrzeuge und Mannschaft zuweisen"
            secondary="Fahrzeuge und Personal dem Einsatz zuordnen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Einsätze nach Gruppen filtern"
            secondary="Nur Einsätze einer bestimmten Gruppe oder aller Gruppen anzeigen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Einsätze aktivieren und wechseln"
            secondary="Einen Einsatz als aktiven Einsatz auf der Karte setzen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Einsätze per Link teilen"
            secondary="Anonymer Zugang mit Token-Link, kein Login erforderlich"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Einsätze exportieren und importieren"
            secondary="Einsatzdaten sichern oder aus einer Datei wiederherstellen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Einsätze abschließen und löschen"
            secondary="Abgeschlossene Einsätze archivieren oder entfernen (nur Admins)"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Alarm-SMS-Integration"
            secondary="Beim Erstellen eines Einsatzes aktuelle Alarme automatisch übernehmen"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Neuen Einsatz anlegen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Über den Erstellen-Button kannst du einen neuen Einsatz mit allen
        relevanten Informationen anlegen.
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Klicke auf den Erstellen-Button (FAB-Button) in der Einsatzliste
          </li>
          <li>
            Fülle im Dialog die folgenden Felder aus:
            <Box component="ul" sx={{ mt: 1 }}>
              <li>
                <strong>Name/Bezeichnung</strong> &ndash; Kurzbeschreibung des
                Einsatzes
              </li>
              <li>
                <strong>Gruppe</strong> &ndash; Zugehörige Feuerwehr-Gruppe
              </li>
              <li>
                <strong>Feuerwehr</strong> &ndash; Zuständige Feuerwehr
              </li>
              <li>
                <strong>Alarmierung Datum/Zeit</strong> &ndash; Wann der Alarm
                eingegangen ist
              </li>
              <li>
                <strong>Beschreibung</strong> &ndash; Weitere Details zum Einsatz
              </li>
              <li>
                <strong>Eintreffen</strong> &ndash; Zeitpunkt des Eintreffens am
                Einsatzort
              </li>
              <li>
                <strong>Abrücken</strong> &ndash; Zeitpunkt des Abrückens vom
                Einsatzort
              </li>
            </Box>
          </li>
          <li>Klicke auf &quot;Speichern&quot;, um den Einsatz anzulegen</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Alarm SMS beim Erstellen nutzen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Wenn für deine Gruppe Zugangsdaten für die Alarm SMS hinterlegt sind,
        kannst du beim Erstellen eines Einsatzes aktuelle Alarme direkt
        übernehmen.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne den Dialog zum Erstellen eines neuen Einsatzes</li>
          <li>
            Wenn für die gewählte Gruppe Alarm-SMS-Zugangsdaten vorhanden sind,
            erscheint ein Alarm-Dropdown
          </li>
          <li>Wähle den gewünschten Alarm aus der Liste aus</li>
          <li>
            Die Daten wie Name, Adresse, Alarmierungszeit und Beschreibung
            werden automatisch in die Felder übernommen
          </li>
          <li>
            Prüfe die übernommenen Daten und ergänze sie bei Bedarf
          </li>
          <li>Klicke auf &quot;Speichern&quot;</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Die Alarm-SMS-Integration lädt automatisch aktuelle Alarme, wenn für
        die Gruppe Zugangsdaten hinterlegt sind. Kontaktiere einen Admin, falls
        die Integration für deine Gruppe eingerichtet werden soll.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Einsatz aktivieren
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Nur ein aktiver Einsatz wird auf der Karte angezeigt. Du kannst zwischen
        Einsätzen wechseln, indem du einen anderen Einsatz aktivierst.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne die Einsatzliste</li>
          <li>
            Klicke beim gewünschten Einsatz auf den Button
            &quot;Aktivieren&quot;
          </li>
          <li>
            Der Einsatz wird als aktiver Einsatz gesetzt und auf der Karte
            angezeigt
          </li>
          <li>
            Der zuvor aktive Einsatz wird automatisch deaktiviert
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Einsatz bearbeiten
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Bestehende Einsätze kannst du jederzeit bearbeiten, um Details zu
        ergänzen oder zu korrigieren.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne den gewünschten Einsatz</li>
          <li>Klicke auf das Stift-Symbol, um den Bearbeitungsmodus zu öffnen</li>
          <li>
            Ändere die gewünschten Felder (Name, Adresse, Zeiten,
            Beschreibung etc.)
          </li>
          <li>Klicke auf &quot;Speichern&quot;, um die Änderungen zu übernehmen</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Einsatz teilen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Du kannst einen Einsatz per Link mit anderen Personen teilen. Der Link
        ermöglicht den Zugriff ohne Login.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne den gewünschten Einsatz</li>
          <li>Klicke auf das Teilen-Symbol</li>
          <li>
            Der Link wird automatisch in die Zwischenablage kopiert
          </li>
          <li>
            Sende den Link an die gewünschten Personen (z.B. per Messenger oder
            E-Mail)
          </li>
          <li>
            Empfänger können den Einsatz über den Link ohne Login einsehen
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Über den Teilen-Button kannst du einen anonymen Link erstellen. Personen
        mit diesem Link können den Einsatz ohne Login einsehen. Teile den Link
        nur mit vertrauenswürdigen Personen.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Einsätze filtern
      </Typography>
      <Typography sx={{ mb: 2 }}>
        In der Einsatzliste kannst du die angezeigten Einsätze nach Gruppe
        filtern, um schnell den richtigen Einsatz zu finden.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne die Einsatzliste</li>
          <li>
            Nutze das Gruppen-Dropdown oben in der Liste
          </li>
          <li>
            Wähle &quot;Alle Gruppen&quot;, um alle Einsätze zu sehen, oder
            wähle eine spezifische Gruppe
          </li>
          <li>
            Die Liste wird sofort gefiltert und zeigt nur Einsätze der
            gewählten Gruppe an
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Einsatz exportieren und importieren
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Einsatzdaten können exportiert werden, um sie zu sichern oder in ein
        anderes System zu übertragen. Ebenso können gesicherte Einsätze wieder
        importiert werden.
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            <strong>Exportieren:</strong> Öffne den gewünschten Einsatz und
            nutze die Export-Funktion, um die Einsatzdaten als Datei
            herunterzuladen
          </li>
          <li>
            <strong>Importieren:</strong> Nutze die Import-Funktion in der
            Einsatzliste, um eine zuvor exportierte Datei wieder einzulesen
          </li>
          <li>
            Nach dem Import werden alle Einsatzdaten wiederhergestellt
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Elemente hinzufügen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne einen bestehenden Einsatz</li>
          <li>Wähle den Elementtyp (Fahrzeug, Person, etc.)</li>
          <li>Füge das Element mit den entsprechenden Daten hinzu</li>
        </ol>
      </Typography>
    </>
  );
}
