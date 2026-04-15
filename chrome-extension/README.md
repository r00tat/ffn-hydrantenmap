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

Führt `tsc --noEmit` und `vite build` aus. Output in `dist/`. Liest Env aus der
projekt-weiten `.env.local` im Root (dieselbe wie die Next.js-App).

### Production Release Build (ZIP + CRX)

```bash
npm run build:prod
```

Baut mit **production**-Env aus `chrome-extension/.env.production.local` und
erzeugt zwei Artefakte im `chrome-extension/` Verzeichnis:

- `einsatzkarte-<version>.zip` — flaches ZIP für den **Chrome Web Store** Upload
- `einsatzkarte-<version>.crx` — signierte CRX für **Enterprise Policy** oder Self-Hosting

Voraussetzungen:

1. `chrome-extension/dist.pem` — privater Schlüssel (gitignored, von den Admins)
2. `chrome-extension/.env.production.local` — überschreibt gezielt die Werte
   aus der Root-`.env.local`. Nur Vars reinschreiben, die sich in Prod
   unterscheiden. Typisch reicht:

```bash
NEXT_PUBLIC_FIRESTORE_DB=''   # leer = Prod-DB, ''ffndev'' wäre die Dev-DB
```

Alle anderen Vars (Firebase-Config, OAuth-Client-ID, Public-Key) werden aus der
Projekt-Root-`.env.local` übernommen.

Falls der Prod-Build mit einem anderen OAuth-Client oder Signaturschlüssel
laufen soll, nur diese Zeilen zusätzlich in `.env.production.local` setzen.
Den `CHROME_EXTENSION_PUBLIC_KEY` aus dem privaten Schlüssel ableiten:

```bash
openssl pkey -in dist.pem -pubout -outform DER | base64
```

**Hinweis:** Die CRX lässt sich **nicht** per Drag & Drop in Chrome installieren
(`CRX_REQUIRED_PROOF_MISSING`) — dafür den Chrome Web Store oder Enterprise
Policy verwenden. Für manuelle Tests das ZIP entpacken und als „Entpackte
Erweiterung" laden.

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
