import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from 'next/link';

export default function StrahlenschutzDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Strahlenschutz
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Der Strahlenschutz-Rechner vereint fünf Werkzeuge zur Abschätzung von
        Dosisleistung, Abschirmung, Aufenthaltszeit, Nuklidaktivität und
        Einheitenumrechnung. Alle Berechnungen laufen rein clientseitig im
        Browser.
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Die Seite erreichst du über <strong>Schadstoff → Strahlenschutz</strong>.
        Für die Gamma-Spektroskopie und Nuklid-Identifikation aus
        RadiaCode-Messungen siehe{' '}
        <Link href="/docs/energiespektrum">Energiespektrum</Link>.
      </Alert>

      <Alert severity="warning" sx={{ my: 2 }}>
        Hinweis: Die Rechner liefern eine schnelle Lage-Abschätzung. Für reale
        Einsatzentscheidungen sind die Werte der eingesetzten Dosimeter sowie
        die offiziellen Grenzwerte und Empfehlungen (Strahlenschutzbeauftragter,
        Land, Strahlenschutzabteilung) verbindlich.
      </Alert>

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText
            primary="Quadratisches Abstandsgesetz"
            secondary="Dosisleistung bei Abstandsänderung berechnen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Schutzwert (Abschirmung)"
            secondary="Reduktion der Dosisleistung durch mehrere Schichten Abschirmung"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Aufenthaltszeit"
            secondary="Zulässige Einsatzdauer bei gegebener Dosisleistung und Grenzdosis"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Dosisleistung aus Nuklidaktivität"
            secondary="Dosisleistung in 1 m Abstand aus Aktivität und Nuklid-Gamma-Konstante"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Einheitenumrechnung"
            secondary="Sv / mSv / µSv / nSv, Gy, R und Dosisleistungen"
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="Berechnungsverlauf"
            secondary="Jeder Rechner merkt sich die letzten Ergebnisse inkl. Formel und Werte für die Dokumentation im Einsatz"
          />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Allgemeine Bedienung
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Alle Rechner funktionieren nach demselben Prinzip: Du gibst alle bis auf
        eine Variable ein und lässt das zu berechnende Feld <strong>leer</strong>.
        Mit Klick auf <strong>Berechnen</strong> wird der fehlende Wert ermittelt
        und der aktuelle Durchgang dem Verlauf hinzugefügt. <strong>Löschen</strong>{' '}
        setzt die Eingaben zurück, ohne den Verlauf zu verwerfen.
      </Typography>
      <Typography component="div">
        <ul>
          <li>Dezimaltrennung: Komma und Punkt werden beide akzeptiert</li>
          <li>Leere Eingaben zählen als &quot;unbekannt&quot;</li>
          <li>
            Alle Rechner zeigen unter dem Ergebnis die verwendete Formel und die
            eingesetzten Werte — praktisch für den Übertrag ins Einsatztagebuch
          </li>
        </ul>
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        1. Quadratisches Abstandsgesetz
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Die Dosisleistung einer punktförmigen Quelle nimmt quadratisch mit dem
        Abstand ab:
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
        D1² × R1 = D2² × R2
      </Box>
      <Typography sx={{ mt: 1, mb: 1 }}>
        Eingaben: Abstand 1 (m), Dosisleistung 1 (µSv/h), Abstand 2 (m),
        Dosisleistung 2 (µSv/h). Genau drei Felder füllen, das vierte leer
        lassen.
      </Typography>
      <Alert severity="info" sx={{ my: 2 }}>
        Beispiel: Bei 1 m gemessen 100 µSv/h — wie groß ist die Dosisleistung in
        5 m Abstand? Felder: D1 = 1, R1 = 100, D2 = 5, R2 leer → R2 = 4 µSv/h.
      </Alert>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        2. Schutzwert (Abschirmung)
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Bei Abschirmung mit einem Material vom Schutzwert S reduziert sich die
        Dosisleistung pro Schicht um den Faktor S:
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
        R = R₀ / S^n
      </Box>
      <Typography sx={{ mt: 1, mb: 1 }}>
        R₀ ist die Dosisleistung ohne Abschirmung, R mit n Schichten. Typische
        Schutzwerte (Gamma-Strahlung, Richtwert): Blei S ≈ 2, Stahl S ≈ 1.5,
        Beton S ≈ 1.3 pro Halbwertsschicht. Bei unbekanntem S wird dieses vom
        Rechner ermittelt.
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        3. Aufenthaltszeit
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Wie lange darf eine Einsatzkraft bei einer bestimmten Dosisleistung
        bleiben, um eine zulässige Dosis nicht zu überschreiten?
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
        t = D / R
      </Box>
      <Typography sx={{ mt: 1, mb: 1 }}>
        t = Aufenthaltszeit (h), D = zulässige Dosis (mSv), R = Dosisleistung
        (mSv/h). Das Ergebnis wird zusätzlich in Tagen / Stunden / Minuten /
        Sekunden ausgegeben, damit kurze Einsatzzeiten sofort ablesbar sind.
      </Typography>
      <Alert severity="info" sx={{ my: 2 }}>
        Referenzwerte (ÖNORM S 5207): Einsatzkräfte 15 mSv/Jahr (allgemein),
        100 mSv einmalig zur Abwehr von Gefahren für Leib und Leben, 250 mSv nur
        zur Rettung von Menschenleben — die zulässige Dosis immer mit dem
        Strahlenschutzbeauftragten abstimmen.
      </Alert>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        4. Dosisleistung aus Nuklidaktivität
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Aus der Aktivität einer Quelle und der nuklidspezifischen
        Gamma-Konstante Γ lässt sich die Dosisleistung in 1 m Abstand
        berechnen:
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
        Ḣ = Γ × A
      </Box>
      <Typography sx={{ mt: 1, mb: 1 }}>
        Γ hat die Einheit µSv·m²/(h·GBq) und ist für jedes Nuklid in der
        Bibliothek hinterlegt. Die Aktivität kann in Bq, kBq, MBq, GBq oder TBq
        eingegeben werden; der Rechner rechnet intern auf GBq um. Wähle zuerst
        das Nuklid, dann die Einheit und anschließend entweder Aktivität oder
        Dosisleistung — das jeweils leere Feld wird berechnet.
      </Typography>
      <Alert severity="info" sx={{ my: 2 }}>
        Beispiel: Cs-137-Quelle mit 10 MBq, wie hoch ist die Dosisleistung in 1 m?
        Nuklid: Cs-137, Aktivität: 10 MBq, Dosisleistung leer → Ergebnis in
        µSv/h. Für andere Abstände das Ergebnis über das{' '}
        <em>Quadratische Abstandsgesetz</em> umrechnen.
      </Alert>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        5. Einheitenumrechnung
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Schnelle Umrechnung zwischen gängigen Dosis- und
        Dosisleistungseinheiten. Die Zieleinheit ist auf Einheiten des gleichen
        Typs beschränkt (Dosis oder Dosisleistung), inkompatible Kombinationen
        werden automatisch ausgeblendet.
      </Typography>
      <Typography component="div">
        <ul>
          <li>
            <strong>Dosis:</strong> Sv, mSv, µSv, nSv, Gy, mGy, µGy, R, mR, µR
          </li>
          <li>
            <strong>Dosisleistung:</strong> Sv/h, mSv/h, µSv/h, nSv/h, Gy/h,
            mGy/h, µGy/h, R/h, mR/h, µR/h
          </li>
          <li>
            Faustformel: 1 R ≈ 0,01 Sv (Gamma-Strahlung, Weichteilgewebe)
          </li>
        </ul>
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Berechnungsverlauf nutzen
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Jeder Rechner führt einen eigenen Verlauf. Pro Eintrag werden die
        verwendeten Eingabewerte, die berechnete Größe, die Formel und der
        Zeitpunkt dokumentiert. Ein Klick auf das Papierkorb-Symbol löscht
        einzelne Einträge; der Verlauf wird nicht in der Datenbank gespeichert
        und geht beim Neuladen der Seite verloren. Für die dauerhafte
        Dokumentation Ergebnisse manuell ins{' '}
        <Link href="/docs/tagebuch">Einsatztagebuch</Link> übertragen.
      </Typography>
    </>
  );
}
