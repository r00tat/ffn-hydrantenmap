import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Screenshot from '../../../components/docs/Screenshot';

export default function KarteDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Karte
      </Typography>
      <Typography paragraph>
        Die Karte zeigt Hydranten und andere wichtige Punkte im Einsatzgebiet an.
        Du kannst die Karte verschieben, zoomen und verschiedene Layer aktivieren.
        Im Bearbeitungsmodus kannst du Elemente auf der Karte platzieren und
        Zeichenwerkzeuge verwenden.
      </Typography>

      <Screenshot src="/docs-assets/screenshots/karte.png" alt="Kartenansicht" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Hydranten anzeigen und Details abrufen"
            secondary="Klicke auf einen Marker, um Informationen wie Typ, Durchfluss und Standort zu sehen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Karte verschieben und zoomen"
            secondary="Per Touch-Gesten auf Mobilgeräten oder Mausrad und Drag am Desktop"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Verschiedene Basiskarten"
            secondary="Orthofoto, Basemap, Basemap grau, OpenStreetMap, OpenTopoMap"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Overlay-Layer"
            secondary="Einsatzorte, Entfernung, Umkreis, Position, Stromausfälle, Pegelstände, Wetterstationen, Adressen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="WMS-Layer"
            secondary="Hochwasser, Risikogebiete, Überflutungsgebiete (bereitgestellt vom Land Burgenland)"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Standort suchen"
            secondary="Adresse oder Ort eingeben und auf der Karte anzeigen lassen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Bearbeitungsmodus mit Zeichenwerkzeugen"
            secondary="Elemente auf der Karte platzieren, Linien und Flächen zeichnen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Elemente auf der Karte platzieren"
            secondary="Fahrzeuge, Marker, Linien und Flächen für den aktiven Einsatz hinzufügen"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Hydranten anzeigen
      </Typography>
      <Typography paragraph>
        Hydranten werden als farbige Marker auf der Karte dargestellt. Je nach
        Zoomstufe werden nahe beieinanderliegende Hydranten zu Clustern
        zusammengefasst. Beim Heranzoomen lösen sich die Cluster in einzelne
        Marker auf.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne die Karte über das Menü oder die Startseite</li>
          <li>
            Hydranten werden automatisch als farbige Marker auf der Karte
            angezeigt
          </li>
          <li>
            Zoome in den gewünschten Bereich, um einzelne Hydranten zu sehen
          </li>
          <li>
            Klicke auf einen Hydranten-Marker, um ein Popup mit Details wie Typ,
            Durchfluss und genauer Position zu öffnen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Basiskarte und Layer wechseln
      </Typography>
      <Typography paragraph>
        Die Karte unterstützt verschiedene Basiskarten und zusätzliche
        Overlay-Layer, die du nach Bedarf ein- und ausschalten kannst.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicke auf das Layer-Symbol rechts oben auf der Karte</li>
          <li>
            Wähle unter &quot;Basiskarte&quot; die gewünschte Kartenansicht aus:
            <Box component="ul" sx={{ mt: 1 }}>
              <li>
                <strong>Orthofoto</strong> &ndash; Satellitenbilder
              </li>
              <li>
                <strong>Basemap</strong> &ndash; Standard-Kartendarstellung
              </li>
              <li>
                <strong>Basemap grau</strong> &ndash; Dezente, graue
                Kartendarstellung
              </li>
              <li>
                <strong>OpenStreetMap</strong> &ndash; Community-Karte mit vielen
                Details
              </li>
              <li>
                <strong>OpenTopoMap</strong> &ndash; Topografische Karte mit
                Höhenlinien
              </li>
            </Box>
          </li>
          <li>
            Aktiviere oder deaktiviere Overlays, indem du die Checkboxen setzt:
            <Box component="ul" sx={{ mt: 1 }}>
              <li>
                <strong>Einsatzorte</strong> &ndash; Markierungen vergangener und
                aktiver Einsätze
              </li>
              <li>
                <strong>Entfernung</strong> &ndash; Zeigt Entfernungslinien
                zwischen Punkten
              </li>
              <li>
                <strong>Umkreis</strong> &ndash; Kreisdarstellung um einen
                gewählten Punkt
              </li>
              <li>
                <strong>Position</strong> &ndash; Dein aktueller GPS-Standort
              </li>
              <li>
                <strong>Stromausfälle</strong> &ndash; Aktuelle
                Stromausfallgebiete
              </li>
              <li>
                <strong>Pegelstände</strong> &ndash; Wasserstände an Messstellen
              </li>
              <li>
                <strong>Wetterstationen</strong> &ndash; Wetterdaten in der
                Umgebung
              </li>
              <li>
                <strong>Adressen</strong> &ndash; Adresspunkte auf der Karte
              </li>
            </Box>
          </li>
          <li>
            Die Auswahl wird gespeichert und beim nächsten Öffnen
            wiederhergestellt
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Die WMS-Layer (Hochwasser, Risikogebiete, Überflutungsgebiete) werden vom
        Land Burgenland bereitgestellt und zeigen aktuelle Geodaten.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Standort suchen
      </Typography>
      <Typography paragraph>
        Mit der Suchfunktion kannst du schnell zu einer bestimmten Adresse oder
        einem Ort auf der Karte navigieren.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicke auf das Suchfeld bzw. das Lupen-Symbol auf der Karte</li>
          <li>Gib eine Adresse, einen Ortsnamen oder eine Bezeichnung ein</li>
          <li>Wähle ein Ergebnis aus der Vorschlagsliste aus</li>
          <li>
            Die Karte zoomt automatisch auf den gefundenen Standort und zeigt
            einen Marker an
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Bearbeitungsmodus verwenden
      </Typography>
      <Typography paragraph>
        Im Bearbeitungsmodus kannst du Elemente zum aktiven Einsatz auf der Karte
        hinzufügen, verschieben und bearbeiten.
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Klicke auf das Stift-Symbol in der Werkzeugleiste, um den
            Bearbeitungsmodus zu aktivieren
          </li>
          <li>
            Klicke auf den Plus-Button, um ein neues Element hinzuzufügen
          </li>
          <li>
            Wähle den gewünschten Element-Typ aus (z.B. Fahrzeug, Marker, Linie,
            Fläche)
          </li>
          <li>
            Platziere das Element auf der Karte durch Klicken auf die gewünschte
            Position
          </li>
          <li>
            Bestehende Elemente kannst du durch Anklicken auswählen und
            bearbeiten oder verschieben
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Aktiviere den Bearbeitungsmodus nur, wenn du Änderungen vornehmen
        möchtest. Im Ansichtsmodus kannst du die Karte schneller bedienen.
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Zeichenwerkzeuge
      </Typography>
      <Typography paragraph>
        Im Bearbeitungsmodus stehen dir verschiedene Zeichenwerkzeuge zur
        Verfügung, mit denen du Linien, Flächen und Markierungen direkt auf der
        Karte einzeichnen kannst.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Aktiviere den Bearbeitungsmodus (Stift-Symbol)</li>
          <li>
            Wähle eine der 8 verfügbaren Farben für deine Zeichnung aus
          </li>
          <li>
            Stelle die gewünschte Linienstärke ein (3 Stufen verfügbar: dünn,
            mittel, dick)
          </li>
          <li>Zeichne Linien oder Flächen durch Klicken auf die Karte</li>
          <li>
            Nutze <strong>Undo</strong> und <strong>Redo</strong>, um
            Zeichenschritte rückgängig zu machen oder wiederherzustellen
          </li>
          <li>
            Klicke auf <strong>Fertig</strong>, um die Zeichnung zu speichern,
            oder auf <strong>Abbrechen</strong>, um sie zu verwerfen
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Entfernung messen
      </Typography>
      <Typography paragraph>
        Mit dem Entfernungs-Overlay kannst du Abstände zwischen Punkten auf der
        Karte messen.
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne die Layer-Auswahl über das Layer-Symbol rechts oben</li>
          <li>
            Aktiviere das Overlay <strong>Entfernung</strong>
          </li>
          <li>
            Klicke auf der Karte auf den Startpunkt und dann auf den Endpunkt
          </li>
          <li>Die gemessene Entfernung wird auf der Karte angezeigt</li>
        </ol>
      </Typography>
    </>
  );
}
