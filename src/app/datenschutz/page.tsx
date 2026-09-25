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
        Bestimmungen (DSGVO, DSG, TKG 2021). In dieser Datenschutzerklärung
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
          <li>
            Atemschutz­einsätze (Namen der Trupp­mitglieder, Flaschen­drücke,
            Einsatz­zeiten) und das Füll­protokoll der Atemschutz­flaschen
          </li>
          <li>Fahrtenbuch (Fahrzeug, Fahrer, Zweck, Kilometer­stände)</li>
          <li>
            Fehlermeldungen und Verbesserungs­vorschläge samt freiwillig
            beigefügtem Bildschirmfoto
          </li>
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
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Schalten Sie im Einsatz den <b>Live-Standort</b> ein, wird Ihre Position
        laufend gespeichert und den anderen Berechtigten dieses Einsatzes auf
        der Karte angezeigt, zusammen mit Ihrem Namen und einer Bezeichnung des
        Geräts. Beim Ausschalten wird der Eintrag gelöscht; bleibt er zurück
        (etwa weil der Akku leer ist), wird er nach einer Stunde automatisch
        entfernt.
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
      <Typography variant="h5">Sprach-Assistent</Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Der Sprach-Assistent ist optional und wird nur auf Ihre Aktion hin
        gestartet. Solange er läuft, werden Ihre Sprach­aufnahme und ein
        Überblick über den geöffneten Einsatz (z.B. Elemente auf der Karte) an
        Google (Gemini) übermittelt und dort verarbeitet, um Ihre Anweisung
        auszuführen. Die Abschrift des Gesprächs und die Notizen des Assistenten
        werden nur lokal auf Ihrem Gerät gespeichert.
      </Typography>
      <Typography variant="h5">Cookies und lokale Speicherung</Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Die Einsatzkarte speichert ausschließlich Daten auf Ihrem Gerät, die für
        die von Ihnen genutzten Funktionen technisch erforderlich sind (§ 165
        Abs. 3 TKG 2021). Eine Einwilligung ist dafür nicht erforderlich. Es
        werden <b>keine</b> Cookies oder Speicher für Analyse,
        Reichweiten­messung, Werbung oder Tracking eingesetzt. Im Einzelnen:
        <ul>
          <li>
            <b>Session-Cookies</b> (NextAuth.js) zur Aufrechterhaltung Ihrer
            Anmeldung. Sie enthalten keine personenbezogenen Inhalte im Klartext
            und werden nach Ablauf der Sitzung bzw. beim Abmelden gelöscht.
          </li>
          <li>
            <b>Einstellungs-Cookies</b> für die von Ihnen gewählte Sprache und
            Anzeige­einstellungen.
          </li>
          <li>
            <b>Anmelde­daten von Firebase Authentication</b> im Speicher des
            Browsers (IndexedDB), damit Sie angemeldet bleiben.
          </li>
          <li>
            <b>Offline-Zwischenspeicher</b> (IndexedDB und Service-Worker-Cache)
            für Einsatzdaten, Karten­kacheln und Programmdateien, damit die
            Karte auch ohne Verbindung funktioniert und Änderungen nachträglich
            übertragen werden.
          </li>
          <li>
            <b>Lokale Einstellungen</b> (localStorage), z.B. gewählte Gruppe,
            Einheit, Geräte­zuordnung, eingeklappte Bereiche oder die Notizen
            des Sprach-Assistenten.
          </li>
          <li>
            <b>Missbrauchs­schutz</b>: Zur Absicherung der Schnittstellen wird
            Firebase App Check mit Google reCAPTCHA Enterprise eingesetzt. Dabei
            werden technische Merkmale des Browsers an Google übermittelt, um
            automatisierte Zugriffe zu erkennen.
          </li>
        </ul>
        Sie können diese Daten jederzeit über die Einstellungen Ihres Browsers
        löschen; danach müssen Sie sich neu anmelden.
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
            Standortfreigabe, Push-Benachrichtigungen, Sprach-Assistent und die
            Anbindung externer KI-Anwendungen)
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
        Zur technischen Bereitstellung der Einsatzkarte werden folgende
        Dienstleister auf Grundlage eines Auftragsverarbeitungsvertrags gemäß
        Art. 28 DSGVO eingesetzt:
        <ul>
          <li>
            <b>Google Ireland Limited</b> (Firebase / Google Cloud Platform /
            Google Workspace) – Hosting (Cloud Run), Datenbank (Firestore),
            Authentifizierung, Cloud Messaging, File Storage, Missbrauchs­schutz
            (App Check / reCAPTCHA Enterprise), Sprach-Assistent (Gemini),
            Routen­berechnung (Google Maps Routes API, nur Koordinaten),
            E-Mail-Versand und Ablage von Einsatzfotos (Google Drive). Eine
            Übermittlung in Drittländer (USA) kann nicht ausgeschlossen werden;
            Google ist unter dem EU-US Data Privacy Framework zertifiziert.
          </li>
          <li>
            <b>BlaulichtSMS</b> – Übernahme von Alarmierungen in die
            Einsatzkarte.
          </li>
        </ul>
      </Typography>
      <Typography variant="h4" gutterBottom>
        Weitere Empfänger
      </Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        <ul>
          <li>
            <b>SumUp</b> – Bei Kartenzahlung eines Kostenersatzes werden Betrag
            und Zahlungsreferenz an SumUp übermittelt. SumUp verarbeitet die
            Zahlungsdaten als eigenständig Verantwortlicher.
          </li>
          <li>
            <b>Österreichischer Bundesfeuerwehrverband</b> – Bei einer
            Kennzeichen­abfrage wird das eingegebene Kennzeichen an die Abfrage
            des ÖBFV übermittelt.
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
            Schutzgebiete, Gemeindegrenzen (CC BY 4.0)
          </li>
          <li>
            <b>Bundesministerium für Land- und Forstwirtschaft</b> (WISA) –
            Hochwasser- und Risikokarten
          </li>
          <li>
            Weitere Geodienste öffentlicher Stellen (z.B. LFRZ, Stadt Wien),
            sofern die jeweilige Kartenebene eingeschaltet wird
          </li>
          <li>
            <b>GeoSphere Austria</b> – Wetterstationen, sofern die Ebene
            eingeschaltet wird
          </li>
          <li>
            <b>OpenStreetMap Foundation</b> (Nominatim) – Adresssuche; dabei
            wird der eingegebene Suchbegriff übermittelt
          </li>
        </ul>
        Berechtigte können einem Einsatz zusätzlich eigene Kartendienste (WMS
        oder WMTS) hinzufügen. Deren Kacheln werden ebenfalls direkt von Ihrem
        Browser beim jeweiligen Betreiber abgerufen.
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Pegelstände, Stromausfälle und Rettungskarten (Euro NCAP) werden vom
        Server der Einsatzkarte abgefragt. Dabei werden keine Daten über Sie an
        diese Anbieter übermittelt.
      </Typography>
      <Typography
        component="div"
        sx={{
          marginBottom: '16px',
        }}
      >
        Höhenlinien und Höhenprofile beruhen auf dem{' '}
        <b>Airborne-Laserscan-Geländemodell (ALS-DGM, 1 m)</b> des{' '}
        <b>Bundesamts für Eich- und Vermessungswesen (BEV)</b>, samt dem
        amtlichen Höhen-Grid für die Umrechnung auf Gebrauchshöhen (müA).
        Datenquelle: Bundesamt für Eich- und Vermessungswesen (BEV) – CC BY 4.0.
        Diese Daten werden <b>nicht</b> im Betrieb beim BEV abgerufen: sie
        werden einmalig aufbereitet und aus dem eigenen Speicher ausgeliefert.
        Beim Anzeigen von Höhenlinien geht daher keine Anfrage an das BEV.
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
        Anbindung externer KI-Anwendungen
      </Typography>
      <Typography
        sx={{
          marginBottom: '16px',
        }}
      >
        Sie können der Einsatzkarte über eine eigene Schnittstelle (MCP) den
        Zugriff durch eine KI-Anwendung Ihrer Wahl erlauben. Das geschieht nur,
        wenn Sie den Zugriff ausdrücklich freigeben; Sie können ihn jederzeit
        widerrufen. Die Daten, die diese Anwendung abruft, verarbeitet ihr
        Anbieter nach seinen eigenen Datenschutz­bestimmungen.
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
      <Typography variant="body2" color="text.secondary">
        Stand: September 2026
      </Typography>
      <Box sx={{ mt: 4 }}>
        <Link component={NextLink} href="/about">
          ← Zurück zu About
        </Link>
      </Box>
    </Paper>
  );
}
