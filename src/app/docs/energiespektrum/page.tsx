import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

export default function EnergiespektrumDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Energiespektrum
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Die Energiespektrum-Seite analysiert Gamma-Spektren eines{' '}
        <strong>RadiaCode-101</strong>-Szintillators (CsI(Tl), 1024 Kanäle) und
        identifiziert automatisch die enthaltenen Nuklide. Die gesamte
        Auswertung läuft lokal im Browser – es werden keine Messdaten an einen
        Server übertragen.
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Die Seite erreichst du über <strong>Schadstoff → Energiespektrum</strong>{' '}
        oder direkt über den Menüpunkt <strong>Energiespektrum</strong> im
        aktiven Einsatz. Gespeicherte Messungen sind Teil des Einsatzes und für
        alle berechtigten Benutzer sichtbar.
      </Alert>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Spektren hochladen"
            secondary="Mehrere Dateien gleichzeitig (XML, rcspg, zrcspg, JSON, CSV) aus der offiziellen RadiaCode-App oder dem RadiaCode-Export"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Automatische Nuklid-Erkennung"
            secondary="Peak-Finding mit 3σ-Signifikanz plus Matching gegen eine Bibliothek von 19 Nukliden mit Branching Ratios aus NNDC / IAEA"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Manuelle Nuklid-Zuordnung"
            secondary="Automatik überschreiben, wenn du z.B. aus dem Kontext weißt, dass es sich um ein bestimmtes Präparat handelt"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Mehrere Spektren überlagern"
            secondary="Vergleich von Probe, Untergrund und Referenz im selben Chart – lineare oder logarithmische Y-Achse"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Referenz-Peaks einblenden"
            secondary="Beliebige Nuklide aus der Bibliothek mit ihren theoretischen Peak-Energien als Linien im Chart markieren"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Direktlinks zu Nuklid-Datenbanken"
            secondary="Pro identifiziertem Nuklid Schnellzugriff auf NNDC NuDat 3, IAEA LiveChart und RadiaCode-Spektrenbibliothek"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Speicherung im Einsatz"
            secondary="Hochgeladene Spektren werden als Einsatz-Item gespeichert und tauchen im Einsatztagebuch als Ereignis auf"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        1. Spektrum hochladen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            In der RadiaCode-App die Messung als Datei exportieren (XML, rcspg,
            zrcspg, JSON oder CSV)
          </li>
          <li>
            In der Einsatzkarte <strong>Energiespektrum</strong> öffnen und auf{' '}
            <strong>Datei(en) hochladen</strong> klicken
          </li>
          <li>Eine oder mehrere Spektrendateien auswählen</li>
          <li>
            Die Spektren werden sofort analysiert; das Nuklid mit der höchsten
            Confidence erscheint als grüner Chip hinter dem Probennamen
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Lade zusätzlich zur Probe ein <strong>Untergrundspektrum</strong>{' '}
        hoch (RadiaCode-Messung ohne Probe, gleiche Messzeit). So erkennst du,
        welche Peaks wirklich aus der Probe stammen und welche vom natürlichen
        Untergrund kommen (K-40 bei 1461 keV, Ra-226 / Th-232-Zerfallsreihen).
      </Alert>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        2. Identifikationsergebnis lesen
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Jedes geladene Spektrum wird in der Liste mit dem erkannten Nuklid
        angezeigt:
      </Typography>
      <Typography component="div">
        <ul>
          <li>
            <strong>Grüner Chip</strong> – automatisch erkanntes Nuklid mit
            Confidence in Prozent (z.B. <em>Cs-137 (94%)</em>)
          </li>
          <li>
            <strong>Blauer Chip</strong> – manuell zugeordnetes Nuklid; die
            Automatik wird überschrieben
          </li>
          <li>
            <strong>Gelber Chip &quot;Nicht identifiziert&quot;</strong> – kein
            Referenz-Peak konnte innerhalb der Toleranz gematcht werden
          </li>
          <li>
            <strong>Chip anklicken</strong> – wenn weitere Kandidaten existieren,
            klappen diese auf; ein Klick auf einen Kandidaten blendet dessen
            Peak-Linien im Chart ein
          </li>
          <li>
            <strong>RadiaCode / IAEA / NNDC</strong> – Direktlinks zu den
            Referenzdatenbanken für das identifizierte Nuklid
          </li>
        </ul>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        3. Messung bearbeiten oder manuell zuordnen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            In der Liste auf das <strong>Stift-Symbol</strong> der Messung
            klicken
          </li>
          <li>
            Titel / Probenname, Beschreibung oder ein manuell zugeordnetes
            Nuklid eingeben
          </li>
          <li>
            <strong>Speichern</strong> – die Zuordnung überschreibt die
            Auto-Erkennung in der Liste und im Einsatztagebuch; die ursprüngliche
            Auto-Erkennung bleibt als grauer Hinweis-Chip sichtbar
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        4. Chart bedienen
      </Typography>
      <Typography component="div">
        <ul>
          <li>
            <strong>Auge-Symbol</strong> – einzelne Spektren ein- oder
            ausblenden; der Chart aktualisiert sich automatisch
          </li>
          <li>
            <strong>Logarithmisch</strong> – logarithmische Y-Achse aktivieren,
            um schwache Peaks neben starken sichtbar zu machen
          </li>
          <li>
            <strong>Peaks von Nukliden einblenden</strong> – Dropdown mit allen
            Bibliotheks-Nukliden; ausgewählte Referenz-Peaks werden als farbige
            gestrichelte Linien dargestellt
          </li>
          <li>
            <strong>Rote Linien</strong> – Peaks des tatsächlich identifizierten
            (bzw. manuell zugeordneten) Nuklids der sichtbaren Spektren
          </li>
        </ul>
      </Typography>

      <Alert severity="warning" sx={{ my: 2 }}>
        Achtung: Die Erkennung ersetzt keine qualifizierte Strahlenschutz-Analyse.
        Bei realen Einsätzen oder Verdacht auf Kontamination sind die offiziellen
        Stellen (z.B. Strahlenschutzabteilung des Landes, AGES) einzubinden. Die
        App dient der Vorab-Orientierung.
      </Alert>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Wie funktioniert die Erkennung?
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Die Analyse läuft in drei Stufen ab. Das Eingangs-XML wird vom
        RadiaCode-Spektrometer erzeugt und enthält pro Messung 1024 Kanäle
        (Counts) sowie die Kalibrierungs-Koeffizienten, mit denen jeder Kanal
        einer Energie in keV zugeordnet wird.
      </Typography>

      <Typography variant="h6" gutterBottom>
        Stufe 1 – XML-Parsing und Kalibrierung
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Aus der Datei werden Metadaten (Probenname, Gerät, Mess-/Live-Zeit,
        Start/Ende), die drei Kalibrierungs-Koeffizienten (c₀, c₁, c₂) und die
        1024 Kanal-Counts extrahiert. Daraus wird einmalig pro Kanal die Energie
        berechnet:
      </Typography>
      <Box
        component="pre"
        sx={{
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
          overflowX: 'auto',
          fontSize: 13,
        }}
      >
        E(ch) = c₀ + c₁·ch + c₂·ch²
      </Box>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Stufe 2 – Peak-Finding
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Das Spektrum wird mit einem 5-Bin-Moving-Average geglättet. Ein Kanal
        gilt als Peak-Kandidat, wenn er ein striktes lokales Maximum im
        geglätteten Signal ist. Anschließend wird ein Poisson-Signifikanz-Test
        durchgeführt:
      </Typography>
      <Box
        component="pre"
        sx={{
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
          overflowX: 'auto',
          fontSize: 13,
        }}
      >
        smoothed[i] &gt; mean + 3·√mean
      </Box>
      <Typography sx={{ mt: 1, mb: 2 }}>
        <code>mean</code> ist der Untergrund in benachbarten Kanälen (mit
        Ausschlusszone um den Peak, damit die Peak-Flanken den Untergrund nicht
        verfälschen). Die 3σ-Schwelle entspricht dem Currie&apos;schen{' '}
        <em>Critical Level</em> für Brutto-Counts. Kanäle unterhalb von 40 keV
        werden ignoriert – dort dominiert elektronisches Rauschen des
        CsI(Tl)-Szintillators.
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Stufe 3 – Nuklid-Identifikation
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Für jedes Bibliotheks-Nuklid werden die Referenz-Peaks mit den gefundenen
        Peaks verglichen. Die Match-Toleranz ist energieabhängig (Halbwertsbreite
        des Detektors, HWHM):
      </Typography>
      <Box
        component="pre"
        sx={{
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
          overflowX: 'auto',
          fontSize: 13,
        }}
      >
        FWHM(E) = 0.12 · √(662 · E)   // RadiaCode-101: 12 % bei 662 keV
        {'\n'}tolerance(E) = max(5 keV, 0.5 · FWHM(E))
      </Box>
      <Typography sx={{ mt: 1, mb: 2 }}>
        Jeder Referenz-Peak wird dem nächstgelegenen gefundenen Peak innerhalb
        dieser Toleranz zugeordnet. Aus den Matches wird eine Confidence
        berechnet, die drei Aspekte kombiniert:
      </Typography>
      <Box
        component="pre"
        sx={{
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
          overflowX: 'auto',
          fontSize: 13,
        }}
      >
        confidence = 0.40·intensityMatched + 0.45·avgStrength + 0.15·avgAccuracy
      </Box>
      <List dense sx={{ mb: 2 }}>
        <ListItem>
          <ListItemText
            primary="intensityMatched (40 %)"
            secondary="Branching-Ratio-gewichtete Abdeckung der Referenz-Peaks – gedeckelt auf 1.0, damit schwache Nuklide wie Ra-226 (3.6 % Gesamtemission) nicht automatisch den vollen Bonus bekommen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="avgStrength (45 %)"
            secondary="Mittlere Counts der gematchten Peaks im Verhältnis zum stärksten Peak im Spektrum – bewertet, wie dominant das Nuklid im Spektrum ist"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="avgAccuracy (15 %)"
            secondary="Wie genau die gefundenen Peaks energetisch auf den Referenz-Energien liegen – 1.0 bei perfekter Übereinstimmung, 0 am Rand der Toleranz"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Bekannte Einschränkungen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Mischspektren"
            secondary="Dominante Nuklide drücken sekundäre Nuklide in der Confidence nach unten. Zwei schwache Quellen werden zuverlässig erkannt, eine schwache neben einer starken unter Umständen nicht."
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Überlappende Peaks"
            secondary="Eng benachbarte Peaks innerhalb eines FWHM-Fensters (z.B. Co-57 bei 122.1 und 136.5 keV) werden vom Detektor als ein Peak aufgelöst."
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Interferenzen"
            secondary="Nuklide mit identischen Peak-Energien (z.B. Tc-99m und Mo-99 bei 140.5 keV) lassen sich über ein einziges Spektrum nicht eindeutig unterscheiden."
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Niedrigenergie-Bereich"
            secondary="Unter 40 keV wird wegen elektronischem Rauschen nicht gesucht. Am-241 (59.5 keV) und I-125 (35.5 keV) sind daher nur eingeschränkt bzw. gar nicht erkennbar."
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Referenzen
      </Typography>
      <List dense>
        <ListItem>
          <ListItemText
            primary={
              <Link
                href="https://www.radiacode.com/spectrum-isotopes-library"
                target="_blank"
                rel="noopener noreferrer"
              >
                RadiaCode Spektrenbibliothek
              </Link>
            }
            secondary="Referenzspektren einzelner Nuklide, aufgenommen mit dem RadiaCode-101"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary={
              <Link
                href="https://www.nndc.bnl.gov/nudat3/"
                target="_blank"
                rel="noopener noreferrer"
              >
                NNDC NuDat 3
              </Link>
            }
            secondary="Nuclear Data Center – Peak-Energien und Branching Ratios"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary={
              <Link
                href="https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                IAEA LiveChart of Nuclides
              </Link>
            }
            secondary="Interaktive Nuklidkarte mit Zerfallsdaten"
          />
        </ListItem>
      </List>
    </>
  );
}
