# Einsatzkarte der Freiwilligen Feuerwehr Neusiedl am See

Dieses Repository ermöglicht es Hydranten auf einer Karte darzustellen. Ziel ist es möglichst leicht im Einsatzfall Hydranten lokalisieren zu können.

Für eingeloggte Benutzer bietet es darüber hinaus die Möglichkeit einer Lageführung und eines Einsatztagebuchs.

Die Web App ist für Mobilgeräte optimiert um dies möglichst leicht im Einsatz verwenden zu können.

Die Applikation ist [Open Source](LICENSE) und kann auch von anderen Feuerwehren auf GCP deployed werden.

## Features

- **Hydrantenkarte** - Anzeige von Hydranten und Saugstellen auf einer interaktiven Karte
- **Lageführung** - Situationsmanagement für Einsätze
- **Einsatztagebuch** - Dokumentation von Einsatzereignissen
- **Fahrzeugtracking** - Verfolgung von Einsatzfahrzeugen
- **Schadstoffdatenbank** - Informationen zu Gefahrstoffen
- **PWA** - Installation als App auf Mobilgeräten möglich
- **Push-Benachrichtigungen** - via Firebase Cloud Messaging

## Tech Stack

- **Next.js 16** mit App Router
- **React 19** + **TypeScript**
- **Material-UI (MUI)** für UI-Komponenten
- **Leaflet** + **React Leaflet** für Karten
- **Firebase**: Firestore (Datenbank), Storage (Dateien), Auth, Cloud Messaging
- **NextAuth.js** für Session-Management
- **Serwist** für PWA/Service Worker

## Development

```bash
npm run dev          # Development Server (Turbopack)
npm run build        # Production Build (Webpack)
npm run start        # Production Server starten
npm run lint         # ESLint Validierung
```

## Environment

Erforderliche Umgebungsvariablen (in `.env.local`):

- Firebase Konfiguration (`NEXT_PUBLIC_FIREBASE_*`)
- `NEXT_PUBLIC_FIRESTORE_DB` - `ffndev` für Entwicklung, leer für Produktion
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `MAPBOX_API_KEY` für erweiterte Kartenkacheln

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

[MPL-2.0](LICENSE)
