# Einsatzkarte Chrome Extension

Chrome Extension (Manifest V3) für die Einsatzkarte der FF Neusiedl am See. Bietet ein Popup für Einsatzübersicht und Einsatztagebuch sowie ein Content Script für Sybos-Integration.

## Features

- **Popup**: Login via Google OAuth, Einsatz-Auswahl, Übersicht (Name, Status, Fahrzeuge), Tagebuch-Liste und neuer Eintrag
- **Sybos Content Script**: Einklappbares Widget auf `sybos.lfv-bgld.at` mit aktuellem Einsatz und Link zur Einsatzkarte
- **Echtzeit**: Firestore-Subscriptions für Live-Updates von Einsätzen und Tagebucheinträgen

## Tech Stack

- TypeScript, React 19, MUI 9
- Firebase 12 (Auth, Firestore)
- Vite + CRXJS (Bundler)
- Chrome Manifest V3

## Entwicklung

### Voraussetzungen

- Node.js (siehe `.node-version` im Root)
- `.env.local` im Projekt-Root mit Firebase-Konfiguration (`NEXT_PUBLIC_FIREBASE_APIKEY`, `NEXT_PUBLIC_FIRESTORE_DB`)

### Setup

```bash
cd chrome-extension
npm install
```

### Development

```bash
npm run dev
```

Startet Vite im Watch-Modus mit HMR. Die Extension wird in `dist/` gebaut.

### Production Build

```bash
npm run build
```

Führt `tsc --noEmit` und `vite build` aus. Output in `dist/`.

### In Chrome laden

1. `chrome://extensions/` öffnen
2. "Entwicklermodus" aktivieren
3. "Entpackte Erweiterung laden" → `chrome-extension/dist/` auswählen
4. Extension-Icon klicken → Popup öffnet sich

### Dev/Prod Umschalten

Die Firestore-Datenbank wird über `NEXT_PUBLIC_FIRESTORE_DB` in der `.env.local` gesteuert:
- `ffndev` → Entwicklungsdatenbank
- leer/nicht gesetzt → Produktionsdatenbank

Nach Änderung neu bauen (`npm run build`).

## Google Cloud Console Setup

Damit `chrome.identity.getAuthToken` funktioniert:

1. Google Cloud Console → APIs & Services → Credentials
2. OAuth 2.0 Client-ID für Chrome App erstellen (oder bestehende verwenden)
3. Extension-ID als "Application ID" eintragen
4. `oauth2.client_id` in `manifest.json` anpassen

## Architektur

```
src/
├── popup/              # Popup UI (React + MUI)
│   ├── App.tsx         # Haupt-App mit Auth-State und Tabs
│   ├── components/     # Login, Header, FirecallSelect, Overview, DiaryList, DiaryForm
│   └── hooks/          # useFirecalls, useFirecallItems, useDiaries
├── content/            # Content Script für Sybos
│   ├── sybos.ts        # Widget mit Firecall-Anzeige
│   └── sybos.css       # Widget-Styles
├── background/         # Service Worker
│   └── service-worker.ts  # Firebase Message Handler
└── shared/             # Geteilter Code
    ├── config.ts       # Firebase-Config aus env vars
    ├── firebase.ts     # Firebase Init (App, Auth, Firestore)
    ├── auth.ts         # chrome.identity OAuth + Firebase Auth
    └── types.ts        # Re-exports aus der Haupt-App
```
