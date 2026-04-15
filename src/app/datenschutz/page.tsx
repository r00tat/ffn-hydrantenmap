'use client';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

export default function Datenschutz() {
  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h3">Datenschutzerklärung</Typography>
      </Box>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Der Schutz Ihrer personenbezogenen Daten ist uns ein wichtiges Anliegen.
        Wir verarbeiten Ihre Daten ausschließlich auf Grundlage der gesetzlichen
        Bestimmungen (DSGVO, TKG 2003, DSG). In dieser Datenschutzerklärung
        informieren wir Sie über die wichtigsten Aspekte der Datenverarbeitung
        im Rahmen unserer Einsatzkarte.
      </Typography>
      <Typography variant="h4" gutterBottom>
        Verantwortlicher
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Freiwillige Feuerwehr Neusiedl am See
        <br />
        A-7100 Neusiedl am See, Satzgasse 9<br />
        Tel: +43 2167 / 2250
        <br />
        E-Mail: verwaltung [at] ff-neusiedlamsee [dot] at
        <br />
        <a
          href="http://www.ff-neusiedlamsee.at/"
          target="_blank"
          rel="noopener noreferrer"
        >
          http://www.ff-neusiedlamsee.at/
        </a>
      </Typography>
      <Typography variant="h4" gutterBottom>
        Zweck der Anwendung
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Die Einsatzkarte dient der Freiwilligen Feuerwehr Neusiedl am See zur
        Unterstützung bei Einsätzen. Sie ermöglicht berechtigten Benutzern
        Zugriff auf Hydranten­standorte, Lageführung, Einsatztagebuch,
        Fahrzeug­informationen, Schadstoff­datenbank und weitere
        einsatzrelevante Daten. Der Zugriff ist ausschließlich authentifizierten
        Mitgliedern und Berechtigten vorbehalten.
      </Typography>
      <Typography variant="h4" gutterBottom>
        Verarbeitete Daten
      </Typography>
      <Typography variant="h5">Registrierungs- und Anmeldedaten</Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Für die Anmeldung verwenden wir Firebase Authentication (Google Ireland
        Limited). Je nach gewählter Anmeldemethode werden folgende Daten
        verarbeitet:
        <ul>
          <li>E-Mail-Adresse</li>
          <li>Anzeigename</li>
          <li>Profilbild (bei Google-Login)</li>
          <li>UID (eindeutige Nutzerkennung)</li>
          <li>Zeitpunkt der letzten Anmeldung</li>
        </ul>
      </Typography>
      <Typography variant="h5">Einsatz- und Nutzungsdaten</Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Im Rahmen der Einsatzdokumentation werden Daten verarbeitet, die von
        berechtigten Nutzerinnen und Nutzern selbst eingegeben werden, darunter:
        <ul>
          <li>Einsatz­daten (Einsatzbezeichnung, -ort, -zeitpunkt)</li>
          <li>Lageführung und Einsatztagebuch­einträge</li>
          <li>Fahrzeug- und Personal­zuordnungen</li>
          <li>Chat-Nachrichten zum jeweiligen Einsatz</li>
          <li>Hochgeladene Dokumente, Bilder und Dateien</li>
          <li>Standort­informationen zu Einsatz­objekten</li>
          <li>Kostenersatz-Abrechnungen</li>
        </ul>
      </Typography>
      <Typography variant="h5">Standortdaten</Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Sofern Sie der Nutzung Ihres Gerätestandorts über den Browser zustimmen,
        wird Ihre aktuelle Position zur Anzeige auf der Karte verwendet. Die
        Standortdaten werden lokal im Browser verarbeitet und nur bei
        ausdrücklicher Aktion (z.B. Positionsfreigabe im Einsatz) an den Server
        übermittelt. Sie können die Freigabe jederzeit in den
        Browser-Einstellungen widerrufen.
      </Typography>
      <Typography variant="h5">Push-Benachrichtigungen</Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Für Push-Benachrichtigungen (z.B. bei neuen Einsätzen) verwenden wir
        Firebase Cloud Messaging. Hierfür wird ein eindeutiger Gerätetoken
        erzeugt und mit Ihrem Benutzerkonto verknüpft, sofern Sie der
        Benachrichtigung zustimmen. Die Zustimmung kann jederzeit in den
        Browser- bzw. Geräteeinstellungen widerrufen werden.
      </Typography>
      <Typography variant="h5">Session-Cookies</Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Zur Aufrechterhaltung Ihrer Sitzung setzen wir technisch notwendige
        Cookies (NextAuth.js Session-Cookies). Diese enthalten keine
        personenbezogenen Inhalte im Klartext und werden nach Ablauf der Sitzung
        bzw. beim Abmelden gelöscht.
      </Typography>
      <Typography variant="h5">Protokoll- und Audit-Daten</Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Zur Sicherstellung der Nachvollziehbarkeit und zur Abwehr von Missbrauch
        werden Änderungen an Einsatzdaten in einem Audit-Log protokolliert
        (Benutzer, Zeitpunkt, Art der Änderung).
      </Typography>
      <Typography variant="h4" gutterBottom>
        Rechtsgrundlagen
      </Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Die Verarbeitung erfolgt auf folgenden Rechtsgrundlagen:
        <ul>
          <li>
            <b>Art. 6 Abs. 1 lit. e DSGVO</b> – Wahrnehmung einer Aufgabe im
            öffentlichen Interesse (Feuerwehrwesen nach Bgld. FG)
          </li>
          <li>
            <b>Art. 6 Abs. 1 lit. a DSGVO</b> – Einwilligung (z.B. für
            Standortfreigabe und Push-Benachrichtigungen)
          </li>
          <li>
            <b>Art. 6 Abs. 1 lit. f DSGVO</b> – Berechtigtes Interesse an der
            IT-Sicherheit und der technischen Bereitstellung des Dienstes
          </li>
          <li>
            <b>Art. 6 Abs. 1 lit. b DSGVO</b> – Vertragserfüllung bei
            Kostenersatz­abrechnungen
          </li>
        </ul>
      </Typography>
      <Typography variant="h4" gutterBottom>
        Auftragsverarbeiter
      </Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Zur technischen Bereitstellung der Einsatzkarte wird folgender
        Dienstleister auf Grundlage eines Auftragsverarbeitungsvertrags gemäß
        Art. 28 DSGVO eingesetzt:
        <ul>
          <li>
            <b>Google Ireland Limited</b> (Firebase / Google Cloud Platform) –
            Hosting, Datenbank (Firestore), Authentifizierung, Cloud Messaging,
            File Storage. Eine Übermittlung in Drittländer (USA) kann nicht
            ausgeschlossen werden; Google ist unter dem EU-US Data Privacy
            Framework zertifiziert.
          </li>
        </ul>
      </Typography>
      <Typography variant="h4" gutterBottom>
        Einbindung externer Kartendienste
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Die Kartendarstellung erfolgt durch das direkte Laden von Kartenkacheln
        (Tiles) der nachfolgend genannten Anbieter durch Ihren Browser. Diese
        Anbieter sind datenschutzrechtlich <b>eigenverantwortliche Dritte</b>{' '}
        (nicht Auftragsverarbeiter). Beim Abruf der Kacheln wird technisch
        bedingt Ihre <b>IP-Adresse</b> sowie übliche HTTP-Header (z.B.
        User-Agent, Referrer) an die Server der jeweiligen Anbieter übermittelt.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
        an der kartografischen Darstellung).
      </Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Eingebundene Kartendienste:
        <ul>
          <li>
            <b>basemap.at</b> (Stadt Wien, im Auftrag der Bundesländer) –
            Basemap, Orthofoto, Basemap grau
          </li>
          <li>
            <b>OpenStreetMap Foundation</b> und <b>OpenTopoMap</b> – Straßen-
            und topografische Karten
          </li>
          <li>
            <b>Land Burgenland</b> (GIS Burgenland) – Orthofoto, Naturgefahren,
            Schutzgebiete
          </li>
          <li>
            <b>Bundesministerium für Land- und Forstwirtschaft</b> (WISA) –
            Hochwasser- und Risikokarten
          </li>
        </ul>
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Eine Weitergabe Ihrer personenbezogenen Daten an weitere Dritte erfolgt
        nicht, außer wenn wir gesetzlich dazu verpflichtet sind.
      </Typography>
      <Typography variant="h4" gutterBottom>
        Speicherdauer
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Einsatz- und Nutzungsdaten werden gespeichert, solange dies für die
        Einsatzdokumentation und die gesetzlichen Aufbewahrungspflichten
        erforderlich ist. Benutzerkonten werden gelöscht oder anonymisiert,
        sobald sie nicht mehr benötigt werden oder auf Antrag der betroffenen
        Person, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
      </Typography>
      <Typography variant="h4" gutterBottom>
        Ihre Rechte
      </Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Ihnen stehen grundsätzlich folgende Rechte zu:
        <ul>
          <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
          <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
          <li>Recht auf Löschung (Art. 17 DSGVO)</li>
          <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
          <li>Widerruf einer erteilten Einwilligung (Art. 7 Abs. 3 DSGVO)</li>
        </ul>
        Zur Ausübung dieser Rechte wenden Sie sich bitte an die oben genannte
        Kontaktadresse.
      </Typography>
      <Typography variant="h4" gutterBottom>
        Beschwerderecht
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu
        beschweren. In Österreich ist dies die Österreichische
        Datenschutzbehörde (
        <a
          href="https://www.dsb.gv.at/"
          target="_blank"
          rel="noopener noreferrer"
        >
          www.dsb.gv.at
        </a>
        ).
      </Typography>
      <Box sx={{ mt: 4 }}>
        <Link component={NextLink} href="/about">
          ← Zurück zu About
        </Link>
      </Box>
    </Paper>
  );
}
