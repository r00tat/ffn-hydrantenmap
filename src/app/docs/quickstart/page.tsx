import Typography from '@mui/material/Typography';
import Screenshot from '../../../components/docs/Screenshot';

export default function QuickstartDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Schnellstart
      </Typography>
      <Typography paragraph>
        Diese Anleitung zeigt dir, wie du in wenigen Schritten einen neuen
        Einsatz anlegst und die wichtigsten Funktionen nutzt.
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        1. Neuen Einsatz erstellen
      </Typography>
      <Typography paragraph>
        Klicke oben in der Navigationsleiste auf das Feuer-Symbol, um einen
        neuen Einsatz anzulegen.
      </Typography>
      <Screenshot
        src="/docs-assets/screenshots/quickstart-firecall-button.png"
        alt="Feuer-Symbol in der Navigationsleiste"
      />
      <Typography paragraph>
        Es öffnet sich ein Dialog, in dem du die Einsatzdaten eingeben kannst.
        Fülle die Felder aus (Adresse, Einsatzart, etc.) und speichere den
        Einsatz.
      </Typography>
      <Screenshot
        src="/docs-assets/screenshots/quickstart-firecall-dialog.png"
        alt="Dialog zum Anlegen eines neuen Einsatzes"
      />

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        2. Bearbeitungsmodus aktivieren
      </Typography>
      <Typography paragraph>
        Um Elemente auf der Karte hinzuzufügen, aktiviere den Bearbeitungsmodus.
        Klicke dazu auf das Stift-Symbol in der Kartenansicht.
      </Typography>
      <Screenshot
        src="/docs-assets/screenshots/quickstart-edit-mode.png"
        alt="Bearbeitungsmodus aktivieren"
      />

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        3. Fahrzeug hinzufügen
      </Typography>
      <Typography paragraph>
        Im Bearbeitungsmodus kannst du Fahrzeuge zur Karte hinzufügen. Wähle den
        Fahrzeugtyp (z.B. &quot;TLFA&quot;) und die Feuerwehr (z.B.
        &quot;Neusiedl am See&quot;) aus.
      </Typography>
      <Screenshot
        src="/docs-assets/screenshots/quickstart-add-vehicle.png"
        alt="Fahrzeug hinzufügen"
      />

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        4. Tagebucheintrag erstellen
      </Typography>
      <Typography paragraph>
        Öffne die Seitenleiste und erstelle einen neuen Tagebucheintrag, um
        wichtige Ereignisse während des Einsatzes zu dokumentieren.
      </Typography>
      <Screenshot
        src="/docs-assets/screenshots/quickstart-diary-entry.png"
        alt="Tagebucheintrag in der Seitenleiste"
      />

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Nächste Schritte
      </Typography>
      <Typography paragraph>
        Jetzt hast du die Grundlagen kennengelernt. Erkunde die weiteren
        Funktionen in den anderen Dokumentationsseiten oder probiere die App
        einfach aus!
      </Typography>
    </>
  );
}
