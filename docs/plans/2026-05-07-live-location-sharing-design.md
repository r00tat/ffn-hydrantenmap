# Live-Standort-Sharing — Design

**Datum:** 2026-05-07
**Branch:** `feature/live-location`
**Status:** Approved

## Ziel

Einsatzkräfte sollen ihren Live-Standort innerhalb eines aktiven Firecalls für andere Einsatz-Berechtigte freigeben können. Andere User sehen die Standorte als Avatar-Marker auf der Einsatzkarte. Das Feature funktioniert in Browser und nativer Android-App (mit Foreground Service für Background-Betrieb).

## Entscheidungen aus Brainstorming

| Punkt | Entscheidung |
|---|---|
| UI-Einstiegspunkt | Eigener FAB über dem `RecordButton` |
| Aktivierungs-Flow | Bestätigungs-Dialog mit Defaults sichtbar + ausklappbare „Erweiterte Einstellungen" |
| Auto-Stop | Sharing ist an aktiven Firecall gebunden; bei Wechsel/Verlassen → Stop + Doc-Delete. Native: Background läuft weiter, solange Firecall aktiv |
| Reziprozität | Keine — jeder mit Firecall-Zugriff sieht alle Live-Standorte |
| Defaults | Heartbeat 30 s, Distanz-Schwelle 20 m, OR-Logik |
| Marker | Avatar mit Initialen + permanentes Namens-Label, kein Genauigkeits-Kreis, eigene Leaflet-Layer |
| Eigener Marker | Bleibt der bestehende `PositionMarker`; eigene UID wird aus Live-Layer gefiltert |
| Frische | Soft-Fade ab 2 min, hart-cutoff bei 5 min |
| Native Android | Foreground Service mit Notification, integriert in bestehenden GPS-Track-Service, beide Modi unabhängig |
| Notification-Inhalt | Modus + Firecall-Name |
| Reboot-Verhalten | Sharing wird nicht automatisch wieder gestartet |
| Settings-Persistenz | localStorage, geräte-lokal |
| Marker-Tap | Popup mit Name + „zuletzt aktualisiert vor X min" |
| Stale-Cleanup | Firestore TTL Policy auf `expiresAt` (1 h nach letztem Update) |
| Audit-Log | Kein Eintrag pro Start/Stop |

## Architektur & Komponenten

### Neue Dateien

- `src/components/providers/LiveLocationProvider.tsx` — Context-Provider mit `isSharing`, `settings`, `start()`, `stop()`, `permissionState`. Eingehängt im Einsatz-Layout.
- `src/hooks/useLiveLocationShare.ts` — Schreib-Logik. Konsumiert `usePosition`, throttled per OR-Logik (≥30 s ODER ≥20 m), schreibt Firestore-Doc, ruft Native-Bridge.
- `src/hooks/useLiveLocations.ts` — Lese-Logik. Subscribed via `useFirebaseCollection` auf `call/{firecallId}/livelocation`, filtert clientseitig Docs > 5 min und eigene UID raus.
- `src/hooks/useLiveLocationSettings.ts` — Persistiert `{ heartbeatMs, distanceM }` in `localStorage` mit Defaults und Validierung.
- `src/components/LiveLocation/LiveLocationFab.tsx` — FAB mit drei Zuständen (off, aktiv, Fehler/Permission verweigert).
- `src/components/LiveLocation/LiveLocationDialog.tsx` — Start-Bestätigungs-Dialog mit ausklappbaren Slidern für Heartbeat-Intervall und Distanz-Schwelle.
- `src/components/LiveLocation/LiveLocationStopConfirm.tsx` — kleiner Bestätigungs-Dialog/Snackbar zum Stoppen.
- `src/components/Map/layers/LiveLocationLayer.tsx` — Leaflet `LayerGroup`, rendert alle anderen User-Marker, berechnet Opacity über die Zeit.
- `src/components/Map/markers/LiveLocationMarker.tsx` — Avatar (Initialen + deterministische Farbe) + permanentes Namens-Label als Leaflet `divIcon`. Popup mit Name + relativer Zeit.
- `src/common/liveLocation.ts` — Type-Definition `LiveLocation`, Initialen- und Farb-Helper, Konstanten.

### Geänderte Dateien

- [src/components/Map/Map.tsx](../../src/components/Map/Map.tsx) — neuer `LayersControl.Overlay` „Live-Standorte" mit `LiveLocationLayer`, defaultmäßig eingeschaltet.
- [src/components/Map/RecordButton.tsx](../../src/components/Map/RecordButton.tsx) — `LiveLocationFab` darüber positionieren (gemeinsamer FAB-Stack).
- [src/hooks/recording/nativeGpsTrackBridge.ts](../../src/hooks/recording/nativeGpsTrackBridge.ts) — erweitert um `nativeStartLiveShare`, `nativeStopLiveShare`, `nativeUpdateLiveShareSettings`.
- Capacitor-Native-Code unter [capacitor/android/app/src/main/java/...](../../capacitor/android/app/src/main/java/) — Foreground-Service mit unabhängigen Modus-Flags `track` und `liveShare`. Notification-Text wird kontextabhängig zusammengesetzt.
- [firebase/dev/firestore.rules](../../firebase/dev/firestore.rules) und Prod-Pendant — neue Regeln für `livelocation`.
- Firecall-Layout (z.B. `src/app/einsatz/[firecallId]/layout.tsx` oder vergleichbarer Provider-Wrapper) — `LiveLocationProvider` einhängen.

## Datenmodell

**Collection:** `call/{firecallId}/livelocation/{uid}` — eine Doc pro User pro Firecall, Doc-ID = User-UID.

```ts
interface LiveLocation {
  uid: string;
  name: string;            // displayName, Fallback: email
  email: string;           // immer gefüllt
  lat: number;
  lng: number;
  accuracy?: number;       // gespeichert, aber nicht angezeigt
  heading?: number;
  speed?: number;
  updatedAt: Timestamp;    // serverTimestamp()
  expiresAt: Timestamp;    // updatedAt + 1h, für Firestore TTL
}
```

**Firestore TTL Policy** auf Feld `expiresAt` aktivieren (Cloud Console / `gcloud firestore fields ttls update`).

## Security Rules

```
match /call/{firecallId}/livelocation/{userId} {
  allow read:   if callAuthorized(firecallId);
  allow create: if callAuthorized(firecallId)
                && userId == request.auth.uid
                && request.resource.data.uid == request.auth.uid;
  allow update: if callAuthorized(firecallId)
                && userId == request.auth.uid
                && request.resource.data.uid == request.auth.uid;
  allow delete: if callAuthorized(firecallId)
                && userId == request.auth.uid;
}
```

Diese Regel überschreibt das generische `match /{subitem=**}` für die `livelocation`-Subcollection, damit Schreibzugriff strikt auf die eigene UID begrenzt ist. Lesezugriff bleibt für alle Firecall-berechtigten User offen.

## UI-Flow

### FAB-Zustände

| Zustand | Icon | Farbe | Tap |
|---|---|---|---|
| Off | `LocationOnOutlined` | default | öffnet Start-Dialog |
| Aktiv | `LocationOn` (gefüllt) | primary, leichtes Pulsieren | öffnet Stop-Confirm |
| Fehler / Permission verweigert | `LocationOff` | error | Snackbar/Dialog mit Hinweis |

FAB ist nur sichtbar, wenn der User in einem aktiven Firecall ist und `usePosition` mindestens einmal eine Position geliefert hat (Permission `granted`).

### Start-Dialog

```
Standort teilen?
─────────────────────────
Dein Live-Standort wird für andere Einsatzkräfte
im Einsatz "<Firecall-Name>" sichtbar.

▾ Erweiterte Einstellungen
   Heartbeat-Intervall: 30 s   [Slider 10–120 s]
   Distanz-Schwelle:    20 m   [Slider 5–100 m]

[Abbrechen]            [Standort teilen]
```

Werte werden aus `localStorage` vorbelegt; bei Änderung wieder dort gespeichert.

### Stop-Flow

Tap auf aktiven FAB → Bestätigungs-Dialog „Live-Sharing beenden?". Bei Bestätigung:

1. Lokales Tracking stoppt.
2. Native-Service-Modus `liveShare` deaktiviert (Service stoppt komplett, wenn auch `track` off).
3. Firestore-Doc wird gelöscht.

### Layer-Anzeige

- Eigener Layer in `LayersControl.Overlay` „Live-Standorte" — defaultmäßig **eingeschaltet**.
- Marker = Leaflet `divIcon` mit kreisförmigem Avatar (Initialen, deterministischer Hintergrund aus UID-Hash) und Namens-Label permanent rechts daneben.
- Klick auf Marker → Leaflet-Popup mit Name + „zuletzt aktualisiert vor X min" (live updaten via `Intl.RelativeTimeFormat`).
- Frische-Verlauf clientseitig: `0–2 min → opacity 1.0`, `2–5 min → linear 1.0 → 0.3`, `> 5 min → ausgeblendet`.
- Eigene UID wird aus dem Render gefiltert; eigener `PositionMarker` bleibt davon unabhängig.

## Native Android & Lifecycle

### Bridge-Erweiterung

```ts
// src/hooks/recording/nativeGpsTrackBridge.ts
nativeStartLiveShare({ firecallId, uid, name, email, intervalMs, distanceM, firecallName })
nativeStopLiveShare()
nativeUpdateLiveShareSettings({ intervalMs, distanceM })
```

### Foreground Service

Track-Recording und Live-Share laufen unabhängig im selben Service. Beide haben eigene Modus-Flags. Notification-Text wird kontextabhängig zusammengesetzt:

- Nur Track: „Einsatz wird aufgezeichnet — <Firecall-Name>"
- Nur Live-Share: „Live-Standort wird geteilt — <Firecall-Name>"
- Beides: „Standort wird aufgezeichnet & geteilt — <Firecall-Name>"

Service stoppt automatisch, sobald **beide** Modi off sind.

### Auto-Stop-Bedingungen

1. User tippt FAB → explizit stoppen.
2. Aktiver Firecall ändert sich → automatisch stoppen + alten Doc löschen.
3. Browser: Page unmount / `beforeunload` → Best-Effort Doc-Delete (z.B. Server Action mit `keepalive`-Fetch).
4. Native Android: Reboot → kein Auto-Restart.
5. Permission revoked / GPS deaktiviert → stoppen, FAB zeigt Fehler-Zustand.

### Robustheit

Wenn Browser-Tab crasht ohne Doc-Delete → Doc bleibt liegen, wird durch `expiresAt`-TTL nach 1 h aufgeräumt. UI zeigt es bereits nach 5 min nicht mehr an.

## Edge Cases

- **Initialen:** erste Buchstaben der ersten zwei Wörter aus `name`; Fallback erste 2 Zeichen der Email vor `@`.
- **Avatar-Farbe:** Deterministisch aus `uid`-Hash modulo Palette (~12 gut unterscheidbare Farben).
- **Name-Quelle:** `displayName ?? email`. Beim Schreiben einmalig im Doc gespeichert, kein Live-Lookup beim Marker-Render.
- **Mehrere Tabs / Geräte gleichzeitig:** Doc wird per UID überschrieben → letzter Schreibender gewinnt. Akzeptabel.
- **Settings-Defaults:** Konstanten in `useLiveLocationSettings.ts`: `DEFAULT_HEARTBEAT_MS = 30000`, `DEFAULT_DISTANCE_M = 20`. Slider-Range 10–120 s und 5–100 m.

## Tests (TDD)

Pro Modul Tests neben dem Source (`*.test.ts(x)`):

- `useLiveLocationShare.test.ts` — OR-Throttling: send bei 30 s ohne Bewegung, kein doppelter Send vor 30 s ohne Distanz, send bei ≥20 m vor 30 s, Auto-Stop bei Firecall-Wechsel.
- `useLiveLocations.test.ts` — Filterung > 5 min, Filterung eigener UID, Reaktion auf neue/entfernte Docs.
- `useLiveLocationSettings.test.ts` — Persistenz, Defaults, Slider-Grenzen-Validierung.
- `LiveLocationDialog.test.tsx` — Default-Werte angezeigt, Erweitert ausklappbar, Submit ruft `start()` mit aktuellen Werten.
- `LiveLocationLayer.test.tsx` — rendert nur fremde User, Opacity-Berechnung über die Zeit (Vitest Fake Timers).
- `LiveLocationMarker.test.tsx` — Initialen-Berechnung, Farb-Hash deterministisch, Popup-Inhalt mit relativer Zeit.
- Security Rules: falls `@firebase/rules-unit-testing` verfügbar, Tests für Eigen-Schreib-Zugriff und allgemeinen Lese-Zugriff.
- Manuelle Verifikation: Browser + Native Android, Permissions-Flow, Auto-Stopp bei Firecall-Wechsel, Notification-Text in allen Modus-Kombinationen.

## Build-Sequenz

1. Datenmodell: Type, Konstanten, Helper, Firestore Rules + TTL Policy.
2. `useLiveLocationSettings` (localStorage).
3. `useLiveLocationShare` (OR-Throttling, ohne Native).
4. `LiveLocationProvider`.
5. `useLiveLocations` Read-Hook + `LiveLocationLayer` + `LiveLocationMarker`.
6. `LiveLocationFab` + `LiveLocationDialog` + `LiveLocationStopConfirm` (UI-Aktivierung im Browser).
7. Auto-Stop-Lifecycle (Firecall-Wechsel, Page-Unmount).
8. Native-Bridge + Capacitor Foreground-Service-Erweiterung.
9. Manuelle Tests Browser + Native.
10. PR.
