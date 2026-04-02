import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';

export default function WetterDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Wetter
      </Typography>
      <Typography paragraph>
        Die Wetter-Funktion zeigt aktuelle und historische Wetterdaten von
        TAWES-Messstationen (GeoSphere Austria) an. Die Daten werden in
        10-Minuten-Intervallen erfasst und als interaktive Diagramme
        dargestellt.
      </Typography>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Wetterstationen auf der Karte anzeigen (über Overlay-Layer &quot;Wetterstationen&quot;)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Detailansicht pro Station mit Diagrammen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Verfügbare Messwerte: Temperatur (°C), Windgeschwindigkeit (km/h), Windspitzen (km/h), Windrichtung (°), Luftfeuchtigkeit (%), Luftdruck (hPa), Niederschlag (mm), Schneehöhe (cm), Sonnenscheindauer (min), Globalstrahlung (W/m²)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Zeitraum wählen: 12h, 24h, 48h, 7 Tage" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Aggregationsintervall: 10min, 30min, 1h, 3h (je nach Zeitraum)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Min/Max-Bänder bei aggregierten Daten anzeigen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Verschiedene Diagrammtypen: Linien, Balken, Flächen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Wetterstation auf Karte finden
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Overlay &quot;Wetterstationen&quot; in der Karte aktivieren
          </li>
          <li>Stationsmarker anklicken</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Wetterdaten anzeigen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Station öffnet Detailseite mit allen verfügbaren Diagrammen
          </li>
          <li>
            Stationsname, Höhe und Standort werden angezeigt
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Zeitraum ändern
      </Typography>
      <Typography component="div">
        <ol>
          <li>ButtonGroup oben: 12h, 24h, 48h oder 7d wählen</li>
          <li>Diagramme aktualisieren sich automatisch</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Aggregation anpassen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            ToggleButtonGroup für Intervall: 10min/30min/1h/3h
          </li>
          <li>
            Bei längeren Zeiträumen sind größere Intervalle verfügbar
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Min/Max-Bänder anzeigen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Schalter aktivieren</li>
          <li>
            Zeigt Minimum- und Maximum-Werte als Band um die Linie
          </li>
          <li>Nur bei aggregierten Intervallen &gt; 10min verfügbar</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Zurück zur Karte
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Link &quot;← Zurück zur Karte&quot; oben klicken
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die Wetterdaten stammen von GeoSphere Austria (TAWES-Netzwerk) und
        werden alle 10 Minuten aktualisiert.
      </Alert>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Für einen schnellen Überblick nutze den 24h-Zeitraum mit
        1h-Aggregation. Für detaillierte Analysen den 12h-Zeitraum mit
        10min-Intervall.
      </Alert>
    </>
  );
}
