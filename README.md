# Einsatzkarte der Freiwilligen Feuerwehr Neusiedl am See

Dieses Repository ermöglicht es Hydranten auf einer Karte darzustellen. Ziel ist es möglichst leicht im Einsatzfall Hydranten lokalisieren zu können.

Für eingeloggte Benutzer bietet es darüber hinaus die Möglichkeit einer Lageführung und eines Einsatztagebuchs.

Die Web App ist für Mobilgeräte optimiert um dies möglichst leicht im Einsatz verwenden zu können.

Die Applikation ist [Open Source](LICENSE) und kann auch von anderen Feuerwehren auf GCP deployed werden.

## Features

### Karte & Geodaten

- **Hydrantenkarte** - Hydranten, Saugstellen, Löschteiche, Risiko- und Gefahrobjekte auf einer interaktiven Karte
- **Geohash-Clustering** - Effizientes Laden großer Datenmengen via Firestore-Cluster (Präzision 6)
- **Eigene Layer** - Distanzmessung, Zeichnen (Drawing), Leitungen, FirecallItems-Layer pro Einsatz
- **Externe Layer** - Pegelstände (Hydrographischer Dienst), Stromausfälle (Netz Burgenland), Wetterstationen
- **Heatmap & Interpolation** - Visualisierung von Messwerten (z.B. Strahlung) als Heatmap oder interpolierte Fläche

### Einsatzführung

- **Lageführung** - Situationsmanagement mit eigenen Einsatz-Layern und Items
- **Einsatztagebuch** - Dokumentation von Einsatzereignissen mit Druckansicht
- **Geschäftsbuch** - Übersicht und Druck aller Einsätze
- **Einsatzorte** - Verwaltung mit Status-Markern und Karten-Edit-Dialog
- **Fahrzeugtracking** - Live-Position und Tracks von Einsatzfahrzeugen
- **Crew-Assignment** - Drag-and-Drop-Zuteilung von Personal zu Fahrzeugen
- **Audit Log** - Nachvollziehbare Änderungshistorie

### Spezialmodule

- **Strahlenschutz / Radiacode** - Live-Messung via Bluetooth LE (Android) inkl. Energy-Spectrum, Dosimetrie und Track-Aufzeichnung
- **Schadstoffdatenbank** - Informationen zu Gefahrstoffen
- **Kostenersatz** - Berechnung und PDF-Generierung nach Tarifordnung (LGBl. Nr. 77/2023)
- **AI-Assistent** - Vertex AI / Gemini-gestützte Aktionen auf der Karte
- **Wetter & Chat** - Wetterdaten und einsatzinterner Chat
- **Druckansichten** - Einsatztagebuch, Geschäftsbuch, Fahrzeuge als druckbare PDFs

### Plattform

- **PWA** - Installation auf Mobilgeräten via Serwist Service Worker
- **Native Android-App** - Capacitor-Wrapper für Bluetooth-Funktionen (Radiacode)
- **Push-Benachrichtigungen** - via Firebase Cloud Messaging
- **Blaulicht-SMS-Integration** - Annahme eingehender Alarmierungen

### Screenshots

![Einsatzkarte](docs/screenshots/Einsatzkarte.png 'Einsatzkarte')

![Map Layers](docs/screenshots/Map-Layer.png 'Externe Layer')

![Spektrum](docs/screenshots/Nuklid-Spektrum.png 'Nuklid Spektrum')

## Tech Stack

### Frontend

- **Next.js 16** mit App Router und Server Actions
- **React 19** + **TypeScript 6**
- **Material-UI (MUI) v9** inkl. X-Charts und X-Date-Pickers
- **Leaflet** + **React Leaflet** für Karten, MarkerCluster, Heatmap, RotatedMarker
- **@dnd-kit** für Drag-and-Drop (Crew-Zuteilung)
- **@react-pdf/renderer** und **html2pdf.js** für PDF-Erzeugung
- **Turf**, **proj4**, **geofire-common** für Geodaten-Operationen

### Backend & Daten

- **Firebase**: Firestore (Datenbank), Storage (Dateien), Auth, Cloud Messaging
- **Firebase Admin SDK** für serverseitige Operationen
- **NextAuth.js v5** für Session-Management
- **Google Cloud**: Vertex AI (Gemini), Text-to-Speech, Secret Manager
- **Serwist** für PWA / Service Worker mit FCM-Integration

### Mobile

- **Capacitor 8** als nativer Android-Wrapper
- **@capacitor-community/bluetooth-le** für Radiacode-Anbindung
- **@capacitor-firebase/authentication** für Native-Auth

### Tooling

- **Vitest** + **@testing-library/react** für Unit- und Component-Tests
- **Playwright** für Screenshots und E2E
- **ESLint 9** + **eslint-config-next**
- **Turbopack** (dev) / **Webpack** (build)

## Development

```bash
npm run dev          # Development Server (Turbopack)
npm run build        # Production Build (Webpack)
npm run start        # Production Server starten
npm run lint         # ESLint Validierung
```

## Android App

Für Bluetooth-Funktionen (z.B. Radiacode-Live-Messung) gibt es einen Capacitor-Wrapper in [capacitor/](capacitor/), der die Produktions-PWA in eine native Android-WebView lädt. Voraussetzungen: JDK 17+, Android SDK, `adb` im Pfad.

### Build

```bash
npm run build:android          # Debug-APK
npm run build:android:release  # Release-APK (benötigt Signing-Config in capacitor/android/app)
```

Das Skript führt intern `npx cap sync android` und `./gradlew assembleDebug|assembleRelease` aus. Der fertige APK liegt anschließend unter:

- Debug: `capacitor/android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `capacitor/android/app/build/outputs/apk/release/app-release.apk`

### Install via adb

Gerät per USB oder WLAN verbinden, dann:

```bash
npm run install:android          # baut Debug-APK und installiert via adb install -r
npm run install:android:release  # analog für Release-APK
```

Bei mehreren Geräten `adb -s <device-id> ...` verwenden. Logs live mitlesen: `adb logcat -s Capacitor:V chromium:V`.

### Release

1. Signing-Config in `capacitor/android/app/build.gradle` bzw. `keystore.properties` eintragen (Keystore nicht ins Repo einchecken).
2. Version in `capacitor/android/app/build.gradle` erhöhen (`versionCode` + `versionName`).
3. `npm run build:android:release` ausführen.
4. Signiertes APK aus `capacitor/android/app/build/outputs/apk/release/` verteilen oder in den Play-Store hochladen.

Die App lädt standardmäßig `https://einsatz.ffnd.at` (konfiguriert in [capacitor/capacitor.config.ts](capacitor/capacitor.config.ts)). Für Tests gegen eine andere URL die `server.url` dort anpassen und neu bauen — alternativ zur Laufzeit über die „Einsatzkarte Einstellungen"-App (zweiter Launcher-Icon) eine Override-URL eintragen.

## Environment

Erforderliche Umgebungsvariablen (in `.env.local`):

- Firebase Konfiguration (`NEXT_PUBLIC_FIREBASE_*`)
- `NEXT_PUBLIC_FIRESTORE_DB` - `ffndev` für Entwicklung, leer für Produktion
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`

## Deploy to GCP

```bash
IMAGE_TAG=$(date +%Y%m%d-%H%M%S)
gcloud builds submit . -t eu.gcr.io/ffn-utils/hydrantenmap:$IMAGE_TAG
gcloud run deploy hydrantenmap --allow-unauthenticated --image eu.gcr.io/ffn-utils/hydrantenmap:$IMAGE_TAG --max-instances=2 --region europe-west4
```

Für Dateianhänge auf Firebase Storage muss der Standard-Bucket konfiguriert und die [CORS Policy](https://firebase.google.com/docs/storage/web/download-files?hl=en#download_data_directly_from_the_sdk) gesetzt werden:

```bash
gsutil cors set cors.json gs://<PROJECT-ID>.appspot.com/
```

## Importing Data

### Import über Admin-Oberfläche (empfohlen)

Der einfachste Weg ist der Import über die Admin-Oberfläche in der Web-App. Admins können dort direkt CSV-Dateien hochladen und importieren.

### Import via Kommandozeile

Alternativ können Daten via Skripte importiert werden. Diese benötigen die `GOOGLE_APPLICATION_CREDENTIALS` Umgebungsvariable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=$PWD/config/service_account.json
```

### Hydranten aus Burgenland GIS importieren

1. [Burgenland GIS](https://gis.bgld.gv.at/Datenerhebung/) öffnen und einloggen
2. Developer Tools öffnen und Network-Requests aufzeichnen
3. Nur einen Objekttyp auswählen (z.B. nur Hydranten)
4. Network-Requests als HAR-Datei exportieren

```bash
npm run extract hars/saugstelle.har ND    # HAR-Datei parsen
npm run import saugstelle output/wgs.csv  # CSV in Firestore importieren
```

## Clustering

### Funktionsweise

Die Hydrantenkarte verwendet Geohash-basiertes Clustering für effizientes Laden der Kartendaten:

- **Geohash-Präzision 6** (~1.2km × 0.6km Zellen) gruppiert geografisch nahe Objekte
- Cluster enthalten: Hydranten, Risikoobjekte, Gefahrobjekte, Löschteiche, Saugstellen
- Beim Laden der Karte werden nur Cluster im sichtbaren Bereich abgefragt
- Daten werden in der Firestore-Collection `clusters6` gespeichert

### Cluster aktualisieren

Nach dem Import neuer Daten müssen die Cluster neu berechnet werden.

**Über Admin-Oberfläche (empfohlen):**

1. Als Admin einloggen
2. Admin-Bereich → "Hydrant Clusters" Tab öffnen
3. "Update Clusters" klicken
4. Der Fortschritt wird in Echtzeit angezeigt

Die Admin-Oberfläche führt folgende Schritte aus:

1. Bestehende Cluster aus Firestore laden
2. Alle Collections abrufen (hydrant, risikoobjekt, gefahrobjekt, loeschteich, saugstelle)
3. Daten in Geohash-Cluster zusammenführen
4. Aktualisierte Cluster in Firestore speichern

**Via Kommandozeile:**

```bash
npm run clusterHydrants   # Geohashed Cluster aus CSV generieren
npm run updateClusters    # Cluster-Daten in Firestore aktualisieren
```

## Project Structure

```text
src/
├── app/           # Next.js App Router Seiten und API-Routes
├── components/    # React-Komponenten (Map/, firebase/, providers/, pages/, FirecallItems/)
├── hooks/         # Custom React Hooks
├── common/        # Gemeinsame Utilities und Typen
├── server/        # Server-seitige Utilities (Firebase Admin, Import/Export)
└── worker/        # Service Worker mit FCM-Integration
firebase/          # Firestore Rules und Indexes
```

## License

[GNU General Public License v3](LICENSE)
