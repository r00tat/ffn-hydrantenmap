import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Link from 'next/link';
import Screenshot from '../../../components/docs/Screenshot';

export default function SchadstoffDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Schadstoff
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Die Schadstoffdatenbank enthält Informationen zu gefährlichen Stoffen
        und deren Handhabung im Einsatzfall.
      </Typography>

      <Screenshot src="/docs-assets/screenshots/schadstoff.png" alt="Schadstoffdatenbank" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Gefahrstoffe nach UN-Nummer suchen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gefahrstoffe nach Stoffnamen suchen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Sicherheitsdatenblätter (ERICards) abrufen via externer Link zu ericards.net" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Schutzanzug-Parameter einsehen"
            secondary="Resistenzgrad, Zeitliche Resistenz, Beschädigung"
          />
        </ListItem>
        <ListItem>
          <ListItemText primary="Strahlenschutz-Rechner (eigener Tab)" />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Energiespektrum-Analyse (eigener Tab)"
            secondary="Gamma-Spektroskopie"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        1. Gefahrstoff suchen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Schadstoffdatenbank Tab öffnen</li>
          <li>UN-Nummer ODER Stoffname eingeben</li>
          <li>Suche Button klicken</li>
          <li>Ergebnisliste durchsehen</li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Du kannst entweder nach UN-Nummer (z.B. 1203 für Benzin) oder
        nach Stoffname suchen.
      </Alert>

      <Typography variant="h6" gutterBottom>
        2. Ergebnisse lesen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Jede Karte zeigt: UN-Nummer, Name, Schutzanzug-Parameter mit
            Resistenzgrad, zeitlicher Resistenz und Beschädigung
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom>
        3. ERICards aufrufen
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Button &quot;Ericards&quot; auf der Ergebniskarte klicken
          </li>
          <li>
            Externes Fenster öffnet sich mit vollständigem
            Sicherheitsdatenblatt
          </li>
        </ol>
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Tipp: Die ERICards (Emergency Response Intervention Cards) enthalten
        detaillierte Einsatzhinweise für Ersthelfer.
      </Alert>

      <Typography variant="h6" gutterBottom>
        4. Strahlenschutz nutzen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Tab &quot;Strahlenschutz&quot; wählen</li>
          <li>
            Quadratisches Abstandsgesetz, Schutzwert, Aufenthaltszeit,
            Dosisleistung aus Nuklidaktivität oder Einheitenumrechnung
            berechnen
          </li>
        </ol>
      </Typography>
      <Alert severity="info" sx={{ my: 2 }}>
        Die vollständige Anleitung mit Formeln, Beispielen und Hinweisen zu den
        Referenzwerten findest du unter{' '}
        <Link href="/docs/strahlenschutz">Strahlenschutz</Link>.
      </Alert>

      <Typography variant="h6" gutterBottom>
        5. Energiespektrum analysieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Tab &quot;Energiespektrum&quot; wählen</li>
          <li>Gamma-Spektroskopie-Daten erfassen und Nuklide identifizieren</li>
        </ol>
      </Typography>
      <Alert severity="info" sx={{ my: 2 }}>
        Eine detaillierte Anleitung zur Peak-Erkennung, Nuklid-Identifikation
        und Bedienung der Chart-Ansicht findest du unter{' '}
        <Link href="/docs/energiespektrum">Energiespektrum</Link>.
      </Alert>
    </>
  );
}
