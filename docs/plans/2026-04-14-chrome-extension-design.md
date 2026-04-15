# Chrome Extension für Einsatzkarte — Design

## Zusammenfassung

Chrome Extension (Manifest V3) für die Einsatzkarte der FF Neusiedl am See. Bietet ein Popup für Einsatzübersicht und Einsatztagebuch sowie ein Content Script für Sybos-Integration.

## Anforderungen

### Popup
- Login via Firebase Auth (Google OAuth über `chrome.identity`)
- Einsatz-Auswahl: Dropdown mit allen aktiven Einsätzen, aktuellster vorausgewählt
- Einsatz-Übersicht: Name, Adresse, Datum, Fahrzeuge, Status
- Tagebuch-Liste: Einträge mit Nummer, Art (M/B/F), Zeitstempel, Text
- Neuer Tagebucheintrag: Art, Von, An, Nachricht, Beschreibung

### Content Script (Sybos)
- Einklappbares Widget auf `sybos.lfv-bgld.at`
- Zeigt aktuellen Einsatz kompakt an (Name, Adresse, Status)
- Link "In Einsatzkarte öffnen"
- Zukunft: Daten aus Einsatzkarte in Sybos-Formulare übernehmen

## Architektur

### Ansatz: Firebase SDK direkt

Die Extension nutzt das Firebase JS SDK direkt — gleicher Stack wie die Hauptapp. Kein zusätzlicher Backend-Aufwand, Echtzeit-Updates via Firestore Snapshots, gleiche Security Rules.

### Projektstruktur

```
hydranten-map/
├── chrome-extension/
│   ├── manifest.json            # Manifest V3
│   ├── src/
│   │   ├── popup/               # Popup UI (React + MUI)
│   │   │   ├── App.tsx
│   │   │   ├── index.tsx
│   │   │   └── components/
│   │   │       ├── Login.tsx
│   │   │       ├── FirecallSelect.tsx
│   │   │       ├── FirecallOverview.tsx
│   │   │       ├── DiaryList.tsx
│   │   │       └── DiaryForm.tsx
│   │   ├── content/             # Content Script für Sybos
│   │   │   └── sybos.ts
│   │   ├── background/          # Service Worker
│   │   │   └── service-worker.ts
│   │   └── shared/              # Shared Code
│   │       ├── firebase.ts      # Firebase Init
│   │       └── auth.ts          # Auth-Logik
│   ├── public/
│   │   └── icons/               # Extension Icons
│   ├── vite.config.ts           # Vite + CRXJS Plugin
│   ├── tsconfig.json
│   └── package.json
```

### Tech Stack

- **Manifest V3** — Chrome Extensions Standard
- **Vite + CRXJS** — Bundler mit Hot Reload für Extension-Entwicklung
- **React 19 + MUI** — Konsistent mit Hauptapp
- **Firebase SDK** — Direkte Firestore-Kommunikation
- **TypeScript** — Shared Types aus `src/common/`

### Datenfluss

```
Popup ←→ Firebase/Firestore (direkt via SDK)

Sybos ←→ Content Script ←→ Service Worker ←→ Firebase/Firestore
         (UI-Widget)        (chrome.runtime)   (Auth + Data)
```

Content Script kann nicht direkt auf Firebase zugreifen. Kommunikation über `chrome.runtime.sendMessage()` mit dem Background Service Worker.

## Authentifizierung

1. User öffnet Popup → Login-Button
2. `chrome.identity.launchWebAuthFlow()` mit Google OAuth
3. Firebase Auth verifiziert Token, prüft `authorized` Custom Claim
4. Token in `chrome.storage.local` gespeichert
5. Auto-Refresh via Firebase SDK

Gleiche OAuth Client-ID wie Hauptapp. Nicht-autorisierte User werden abgelehnt (gleiche Logik wie in der App).

## Datenmodell

### Einsatz lesen

```
Firestore: call/{firecallId}
Filter: Aktive Einsätze (nicht gelöscht/abgeschlossen)
Sortierung: Datum absteigend
```

### Tagebuch lesen

```
Firestore: call/{firecallId}/item
Filter: type === 'diary' && deleted !== true
Sortierung: datum aufsteigend
```

### Tagebucheintrag erstellen

Felder:
- `type: 'diary'`
- `art`: 'M' | 'B' | 'F' (Meldung/Befehl/Frage)
- `name`: Nachrichtentext (Pflichtfeld)
- `von`: Absender
- `an`: Empfänger
- `beschreibung`: Optionale Details
- `datum`: ISO-Zeitstempel (automatisch)
- `created`, `creator`, `updatedAt`, `updatedBy`: Audit-Felder
- `editable: true` (manueller Eintrag)

Collection: `call/{firecallId}/item`

## Popup UI Screens

### 1. Login
- Feuerwehr-Logo
- "Mit Google anmelden" Button

### 2. Header (persistent)
- Einsatz-Dropdown (aktuellster vorausgewählt)
- Tab-Navigation: Übersicht | Tagebuch

### 3. Einsatz-Übersicht
- Name, Adresse, Datum
- Anzahl Fahrzeuge, Personen
- Status-Badge

### 4. Tagebuch-Liste
- Scrollbare Liste
- Pro Eintrag: Nummer, Art-Icon, Zeitstempel, Text (Von → An)

### 5. Neuer Eintrag (FAB Button → Formular)
- Art-Auswahl (M/B/F)
- Von / An (Freitext, Autocomplete aus bisherigen Einträgen)
- Nachricht (Pflichtfeld)
- Beschreibung (optional)
- Absenden

## Content Script (Sybos) — V1

- Aktiv auf: `sybos.lfv-bgld.at/*`
- Einklappbares Widget am rechten Seitenrand
- Zeigt aktuellen Einsatz: Name, Adresse, Status, Datum
- "In Einsatzkarte öffnen" Link
- Kommuniziert via `chrome.runtime.sendMessage()` mit Service Worker

### Zukunft (nicht V1)
- Auto-Fill: Einsatzdaten in Sybos-Formulare übernehmen
- Erfordert Analyse der Sybos DOM-Struktur

## Fehlerbehandlung

- **Nicht eingeloggt:** Login-Screen (Popup), "Bitte einloggen"-Hinweis (Content Script)
- **Kein aktiver Einsatz:** Meldung mit Option zur Auswahl vergangener Einsätze
- **Offline:** Firebase SDK cached lokal, Schreiboperationen gequeued
- **Token abgelaufen:** Auto-Refresh, bei Fehler → Login-Screen
- **Sybos nicht erreichbar:** Content Script nur bei URL-Match injiziert

## Entscheidungen

| Entscheidung | Gewählt | Alternativen |
|---|---|---|
| Datenzugriff | Firebase SDK direkt | API-Routes, Hybrid |
| Bundler | Vite + CRXJS | Webpack, Rollup |
| UI Framework | React + MUI | Preact, Vanilla |
| Auth | Firebase Auth + chrome.identity | Session-Übernahme, API Token |
| Projektstruktur | Monorepo (Unterverzeichnis) | Eigenes Repo |
