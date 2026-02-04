import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function KostenersatzDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Kostenersatz
      </Typography>
      <Typography paragraph>
        Erstelle und verwalte Kostenersatz-Abrechnungen für Einsätze gemäß
        der Tarifordnung.
      </Typography>

      <Screenshot src="/docs/screenshots/kostenersatz.png" alt="Kostenersatz" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Abrechnungen erstellen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Positionen hinzufügen (Fahrzeuge, Material, Personal)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Abrechnungen als PDF exportieren" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Abrechnung erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne den Kostenersatz-Bereich</li>
          <li>Wähle den Einsatz aus oder erstelle eine neue Abrechnung</li>
          <li>Füge die Positionen hinzu (Fahrzeuge, Mannstunden, Material)</li>
          <li>Überprüfe die Summe</li>
          <li>Exportiere die Abrechnung als PDF</li>
        </ol>
      </Typography>
    </>
  );
}
