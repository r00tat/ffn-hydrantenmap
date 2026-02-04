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
      <Typography sx={{ mb: 2 }}>
        Erstelle und verwalte Kostenersatz-Abrechnungen für Einsätze gemäß der
        Tarifordnung.
      </Typography>

      <Screenshot
        src="/docs-assets/screenshots/kostenersatz.png"
        alt="Kostenersatz"
      />

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
        Neue Abrechnung erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffne den Kostenersatz-Bereich im Einsatz</li>
          <li>Klicke auf &quot;Neue Berechnung&quot;</li>
          <li>
            Die Berechnung besteht aus drei Tabs: Einsatz, Berechnung und
            Empfänger
          </li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Vorlage verwenden
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Um Zeit zu sparen, kannst du eine gespeicherte Vorlage laden:
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicke auf &quot;Vorlage laden&quot; oben rechts</li>
          <li>Wähle eine bestehende Vorlage aus der Liste</li>
          <li>Die Fahrzeuge und Positionen werden automatisch übernommen</li>
          <li>Passe bei Bedarf die Stunden oder Einheiten an</li>
        </ol>
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Du kannst auch deine aktuelle Berechnung als Vorlage speichern, indem du
        auf &quot;Als Vorlage speichern&quot; klickst.
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Positionen hinzufügen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Im Tab &quot;Berechnung&quot; fügst du die einzelnen Positionen hinzu:
      </Typography>

      <Screenshot
        src="/docs-assets/screenshots/kostenersatz-berechnung.png"
        alt="Kostenersatz Berechnung Tab"
      />
      <List>
        <ListItem>
          <ListItemText
            primary="Fahrzeuge schnell hinzufügen"
            secondary="Oben im Panel kannst du Fahrzeuge mit einem Klick auswählen - die passenden Tarife werden automatisch hinzugefügt"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Kategorien durchsuchen"
            secondary="Öffne die Kategorien (Fahrzeuge, Personal, Material, etc.) und gib die Anzahl der Einheiten ein"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Sonstige Positionen"
            secondary="Für Kosten, die nicht im Tarif enthalten sind, klicke auf 'Position hinzufügen' in Kategorie 12"
          />
        </ListItem>
      </List>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Berechnung
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Die Kosten werden automatisch berechnet:
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Stunden × Einheiten × Tarif"
            secondary="Für die meisten Positionen gilt: Anzahl Stunden mal Anzahl Einheiten mal Stundensatz"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Pauschalen"
            secondary="Manche Positionen haben eine Pauschale für die ersten Stunden, danach gilt der Stundensatz"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Gesamtsumme"
            secondary="Die Gesamtsumme wird unten angezeigt und automatisch aktualisiert"
          />
        </ListItem>
      </List>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Empfänger angeben
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Im Tab &quot;Empfänger&quot; gibst du die Rechnungsadresse ein:
      </Typography>
      <Typography component="div">
        <ol>
          <li>Name des Empfängers (Pflichtfeld)</li>
          <li>Adresse (Straße, PLZ, Ort)</li>
          <li>E-Mail-Adresse (für den E-Mail-Versand erforderlich)</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Abrechnung per E-Mail senden
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Du kannst die Abrechnung direkt per E-Mail versenden:
      </Typography>
      <Typography component="div">
        <ol>
          <li>
            Stelle sicher, dass eine E-Mail-Adresse beim Empfänger eingetragen
            ist
          </li>
          <li>Klicke auf &quot;E-Mail&quot;</li>
          <li>
            Die E-Mail wird mit vorgefertigtem Text geöffnet (aus der Vorlage)
          </li>
          <li>Passe bei Bedarf Betreff und Text an</li>
          <li>Füge optional CC-Empfänger hinzu</li>
          <li>Klicke auf &quot;Senden&quot;</li>
        </ol>
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Die PDF-Rechnung wird automatisch als Anhang beigefügt.
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Speichern und Abschließen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Speichern"
            secondary="Speichert die Berechnung als Entwurf - du kannst sie später weiter bearbeiten"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Abschließen"
            secondary="Schließt die Berechnung ab - danach sind keine Änderungen mehr möglich"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Kopieren"
            secondary="Bei abgeschlossenen Berechnungen kannst du eine Kopie erstellen, um Änderungen vorzunehmen"
          />
        </ListItem>
      </List>
    </>
  );
}
