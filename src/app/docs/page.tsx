import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Link from 'next/link';

const linkStyle = { textDecoration: 'none', color: 'inherit', width: '100%' };

export default function DocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Dokumentation
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Willkommen zur Dokumentation der Einsatzkarte. Hier findest du
        Anleitungen zu allen Funktionen der App.
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Erste Schritte
      </Typography>
      <List>
        <ListItem>
          <Link href="/docs/quickstart" style={linkStyle}>
            <ListItemText
              primary="Schnellstart"
              secondary="In wenigen Schritten einen Einsatz anlegen und die wichtigsten Funktionen kennenlernen"
            />
          </Link>
        </ListItem>
      </List>

      <Divider sx={{ my: 2 }} />

      <Typography variant="h5" gutterBottom>
        Karte und Navigation
      </Typography>
      <List>
        <ListItem>
          <Link href="/docs/karte" style={linkStyle}>
            <ListItemText
              primary="Karte"
              secondary="Hydranten anzeigen, Basiskarten und Overlays wechseln, Bearbeitungsmodus, Zeichenwerkzeuge"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/ebenen" style={linkStyle}>
            <ListItemText
              primary="Ebenen"
              secondary="Eigene Ebenen erstellen, Elemente gruppieren, Heatmaps und Interpolation konfigurieren"
            />
          </Link>
        </ListItem>
      </List>

      <Divider sx={{ my: 2 }} />

      <Typography variant="h5" gutterBottom>
        Einsatzmanagement
      </Typography>
      <List>
        <ListItem>
          <Link href="/docs/einsaetze" style={linkStyle}>
            <ListItemText
              primary="Einsätze"
              secondary="Einsätze erstellen, bearbeiten, teilen, filtern und mit Blaulicht-SMS verknüpfen"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/tagebuch" style={linkStyle}>
            <ListItemText
              primary="Einsatztagebuch"
              secondary="Einträge mit Zeitstempel erstellen, Eintragsarten M/B/F, KI-Zusammenfassung, CSV-Export"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/fahrzeuge" style={linkStyle}>
            <ListItemText
              primary="Fahrzeuge"
              secondary="Fahrzeuge hinzufügen, Zeitstempel verwalten, Besatzungsstärke, Karten-Positionierung"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/einsatzmittel" style={linkStyle}>
            <ListItemText
              primary="Einsatzmittel"
              secondary="Übersicht aller Ressourcen mit Stärketabelle und Ebenen-Gruppierung"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/einsatzorte" style={linkStyle}>
            <ListItemText
              primary="Einsatzorte"
              secondary="Einsatzstellen verwalten, Status-Tracking, Fahrzeug-Zuordnung, E-Mail-Import"
            />
          </Link>
        </ListItem>
      </List>

      <Divider sx={{ my: 2 }} />

      <Typography variant="h5" gutterBottom>
        Kommunikation und KI
      </Typography>
      <List>
        <ListItem>
          <Link href="/docs/chat" style={linkStyle}>
            <ListItemText
              primary="Chat"
              secondary="Echtzeit-Kommunikation mit Push-Benachrichtigungen"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/ki" style={linkStyle}>
            <ListItemText
              primary="KI-Assistent"
              secondary="Einsatz-Zusammenfassungen, Fragen beantworten, Social-Media-Beiträge generieren"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/blaulicht-sms" style={linkStyle}>
            <ListItemText
              primary="Blaulicht-SMS"
              secondary="Alarmierungen anzeigen, Funktionen und Teilnehmer, Alarm-Integration"
            />
          </Link>
        </ListItem>
      </List>

      <Divider sx={{ my: 2 }} />

      <Typography variant="h5" gutterBottom>
        Nachschlagewerke
      </Typography>
      <List>
        <ListItem>
          <Link href="/docs/schadstoff" style={linkStyle}>
            <ListItemText
              primary="Schadstoff"
              secondary="Gefahrstoffdatenbank, ERICards, Strahlenschutz-Rechner, Energiespektrum-Analyse"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/wetter" style={linkStyle}>
            <ListItemText
              primary="Wetter"
              secondary="TAWES-Wetterstationen, Messwerte, interaktive Diagramme mit Zeitraumauswahl"
            />
          </Link>
        </ListItem>
      </List>

      <Divider sx={{ my: 2 }} />

      <Typography variant="h5" gutterBottom>
        Verwaltung und Export
      </Typography>
      <List>
        <ListItem>
          <Link href="/docs/kostenersatz" style={linkStyle}>
            <ListItemText
              primary="Kostenersatz"
              secondary="Abrechnungen erstellen, Positionen hinzufügen, PDF-Export, E-Mail-Versand, SumUp-Zahlung"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/geschaeftsbuch" style={linkStyle}>
            <ListItemText
              primary="Geschäftsbuch"
              secondary="Ein-/ausgehende Vorgänge dokumentieren, Stabsfunktionen S1-S6, CSV-Export"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/drucken" style={linkStyle}>
            <ListItemText
              primary="Drucken"
              secondary="Einsatzberichte drucken mit Karte, Einsatzmitteln, Tagebuch und Geschäftsbuch"
            />
          </Link>
        </ListItem>
        <ListItem>
          <Link href="/docs/admin" style={linkStyle}>
            <ListItemText
              primary="Administration"
              secondary="Benutzerverwaltung, Datenimport, Systemeinstellungen, Audit-Log (nur Admins)"
            />
          </Link>
        </ListItem>
      </List>
    </>
  );
}
