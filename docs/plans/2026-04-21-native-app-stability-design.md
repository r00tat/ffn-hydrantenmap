# Native-App-Stabilität und Pull-to-Refresh — Design

Datum: 2026-04-21
Branch: `feat/native-app-stability` (abgezweigt von `feat/radiacode-via-bluetooth`)

## Kontext

Drei miteinander verwandte Defekte bzw. Lücken in der nativen Android-App (Capacitor-WebView) und der umgebenden PWA:

1. **WebView verhärtet sich auf Chromium-Default-Error-Page bei Netzwerkwechsel (WLAN ↔ LTE).** Es kommt kein Auto-Recover; Tracking bricht ab.
2. **Gespeichertes Radiacode-BLE-Gerät wird angezeigt, aber nicht automatisch verbunden.** „Start Tracking" läuft ohne aktive Verbindung, nur „Wechseln" triggert einen neuen Connect.
3. **Kein Pull-to-Refresh.** Der User erwartet App-typisches Pull-to-Refresh in der nativen Android-App.

Ziel: Alle drei Punkte so fixen, dass die App während eines Einsatzes stabil bleibt und sich nach kurzzeitigen Netzwerk- bzw. BLE-Aussetzern selbst erholt.

## Problem 1 — WebView-Stabilität bei Netzwerkwechsel

### Root Cause

- [capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java:60-72](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java#L60-L72) ruft in `onReceivedError` `super.onReceivedError(...)` auf. Chromium rendert daraufhin seine interne Default-Error-Page (`net::ERR_CONNECTION_ABORTED`-Screen) in der WebView.
- Zusätzlich wird per `showLoadErrorDialog` ein AlertDialog eingeblendet; in der Praxis wird er je nach `isForMainFrame()`-Status, `errorDialogShown`-Flag oder bereits laufendem Dialog nicht immer sichtbar — und selbst wenn, ist er die falsche UX für transiente Netzwerkaussetzer.
- Der Code unterscheidet nicht zwischen transienten und permanenten Fehlern.
- Es existiert **kein `ConnectivityManager.NetworkCallback`** — ein wiederhergestelltes Netzwerk wird nicht erkannt.
- In der Web-Schicht: Recorder-Loops ([`src/hooks/recording/useGpsLineRecorder.ts`](../../src/hooks/recording/useGpsLineRecorder.ts), [`src/hooks/recording/useRadiacodePointRecorder.ts`](../../src/hooks/recording/useRadiacodePointRecorder.ts)) behandeln Firestore-Fehler aus [`useFirecallItemUpdate.ts:136-156`](../../src/hooks/useFirecallItemUpdate.ts#L136-L156) als fatal und stoppen implizit, weil nur eine Snackbar geworfen wird.

### Lösung

**Native Android (primär):**

- In `onReceivedError` die Fehlercodes kategorisieren:
  - **Transient** (Auto-Recover, keine Default-Error-Page): `ERROR_CONNECT`, `ERROR_HOST_LOOKUP`, `ERROR_TIMEOUT`, `ERROR_IO`, `ERROR_PROXY_AUTHENTICATION`.
  - **Permanent** (Dialog wie bisher): `ERROR_BAD_URL`, `ERROR_UNSUPPORTED_SCHEME`, SSL, HTTP-Statuscodes.
- Bei transientem Fehler: letzte Navigation-URL persistent merken, WebView mit eigener Offline-UI überlagern (`loadData(...)` mit HTML-String, keine separate Assets-Datei — siehe YAGNI), **kein Dialog**.
- `ConnectivityManager.registerDefaultNetworkCallback` registrieren. In `onAvailable` prüfen: wenn WebView gerade im Offline-Overlay ist, `webView.loadUrl(lastUrl)` (bzw. `reload()`).
- Backup-Retry per Handler (z.B. Backoff 2s/5s/10s), falls `onAvailable` ausbleibt.
- `errorDialogShown` bleibt für permanente Fehler; für transiente wird stattdessen ein separater Flag (`offlineOverlayShown`) gepflegt, der in `onPageFinished` bzw. nach erfolgreichem Reload zurückgesetzt wird.

**Web-Schicht (sekundär, defensiv):**

- In den Recorder-Hooks einzelne Firestore-Fehler nicht als fatal werten: fehlgeschlagene Writes in einer kleinen In-Memory-Queue zwischenspeichern und bei `window.addEventListener('online', …)` erneut versuchen. Eine Persistenz der Queue ist *nicht* Teil dieses Scopes (YAGNI).
- Firestore hat bereits eigene Reconnect-Logik; wir müssen nur sicherstellen, dass unsere Hooks den Recorder-Zustand nicht bei Einzelfehlern zerstören.

### Nicht-Ziele

- Kein Redesign des Error-Dialogs für permanente Fehler.
- Kein Offline-Queue-Framework für komplette Firestore-Operationen.
- Keine eigene Offline-Fallback-Seite im Serwist-Cache (kann ein späteres Upgrade sein).

## Problem 2 — Radiacode-BLE: Auto-Connect bei gespeichertem Gerät

### Root Cause

- [`src/hooks/radiacode/devicePreference.ts`](../../src/hooks/radiacode/devicePreference.ts) persistiert nur die Device-ID.
- [`src/hooks/radiacode/useRadiacodeDevice.ts:28-131`](../../src/hooks/radiacode/useRadiacodeDevice.ts#L28-L131) ruft `connect()` nicht automatisch auf — Status bleibt `'idle'`, bis der User „Wechseln" klickt (das einen vollen `requestDevice()`-Flow anstößt).
- Kein UI-State für „Gerät gespeichert, aber nicht erreichbar".

### Lösung

- **Auto-Connect** im RadiacodeProvider (bzw. im Hook, sobald die Präferenz geladen ist): wenn `defaultDevice != null` und Status `'idle'` → `connect()` auslösen. Nicht erneut nach manuellem Disconnect.
- **Status-Machine erweitern** um `'reconnecting'` und `'unavailable'`:
  - `'connecting'` (initialer Versuch) → `'connected'` bei Erfolg, `'unavailable'` bei Fehler.
  - `'reconnecting'` bei transienten Disconnects während aktiver Session (mit Backoff).
- **UI-Anzeige** in [`src/components/providers/RadiacodeProvider.tsx`](../../src/components/providers/RadiacodeProvider.tsx) und in der Device-Auswahl bzw. im TrackStartDialog: Statusbadge („Verbunden", „Suche…", „Nicht erreichbar").
- **„Start Tracking" gatekeepen** auf Status `connected`. Bei `unavailable` den Scan-Button hervorheben (oder inline einen Retry-Button anbieten).

### Nicht-Ziele

- Kein Rework der Device-Preference-Persistenz (Capacitor-Preferences bleibt).
- Kein automatisches Umschalten zwischen mehreren gespeicherten Geräten.

## Problem 3 — Pull-to-Refresh in der nativen App (Option A: nativ)

### Ansatz

Android `SwipeRefreshLayout` nativ um die `WebView` legen und bei Pull `webView.reload()` auslösen. Nur in der nativen App aktiv, nicht in der Browser-PWA.

### Umsetzung

- `androidx.swiperefreshlayout:swiperefreshlayout` als Gradle-Dependency im `capacitor/android/app`-Modul hinzufügen (falls nicht bereits transitiv vorhanden).
- Das Capacitor-`activity_main.xml`-Layout so anpassen, dass der Capacitor-WebView von einem `SwipeRefreshLayout` umschlossen ist. Der tricky Part: Die Capacitor-Bridge instanziiert die WebView programmatisch; wir müssen in `MainActivity.onCreate` nach `super.onCreate` das WebView-Parent-Layout anpassen (WebView aus dem Parent-`ViewGroup` entfernen, in `SwipeRefreshLayout` setzen, zurück ins Parent fügen).
- `SwipeRefreshLayout.OnRefreshListener` → `webView.reload()` + `setRefreshing(false)` bei `onPageFinished`.
- **Scroll-Gating:** `SwipeRefreshLayout` soll nur triggern, wenn `webView.getScrollY() == 0`. Das ist Default-Verhalten; bei Leaflet-Karten kann das gesamte Body gescrollt sein → Conflict-Risiko. Maßnahme: `canChildScrollUp()` überschreiben, sodass es `true` zurückgibt, wenn die WebView intern scrollbar ist oder ein Map-Pan aktiv ist. Einfachere erste Implementation: `SwipeRefreshLayout` nur auf Nicht-Map-Seiten aktivieren — aber das ist schwer ohne JS-Bridge. Wir starten mit Default-`canChildScrollUp`-Verhalten und beobachten in der Praxis, ob Map-Konflikte auftreten.
- Farben: nutzt App-Farbschema via `setColorSchemeResources(R.color.colorPrimary)`.

### Nicht-Ziele

- Kein JS-basiertes Pull-to-Refresh (Option B) — hat Konflikte mit Leaflet.
- Kein JS↔Java-Bridge-Plugin für Pull-Trigger. Wir lösen `reload()` direkt in Java aus; Capacitor-Plugin nicht nötig.
- Keine Pull-to-Refresh-UX im Browser-PWA-Modus.

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────┐
│ Android MainActivity                            │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ SwipeRefreshLayout (neu)                  │  │
│  │   onRefresh → webView.reload()            │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │ Capacitor WebView                    │  │  │
│  │  │   onReceivedError:                   │  │  │
│  │  │     transient → Offline-Overlay      │  │  │
│  │  │     permanent → AlertDialog          │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ConnectivityManager.NetworkCallback (neu)      │
│    onAvailable → webView.reload() wenn offline  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Web-Schicht                                     │
│                                                 │
│  RadiacodeProvider                              │
│    on mount + defaultDevice !== null            │
│      → connect() auto                           │
│    status: idle | connecting | reconnecting     │
│            | connected | unavailable            │
│                                                 │
│  Recorder-Hooks                                 │
│    Firestore-Error → Retry-Queue, weiterlaufen  │
│    window 'online' → Queue flush                │
└─────────────────────────────────────────────────┘
```

## Testing

- **Android (manuell, durch User):** Flugmodus an/aus, WLAN ↔ LTE-Wechsel, Pull-Down auf Startseite und in Dosimetrie-Page, Pull-Down auf Karte (Konflikt-Check).
- **BLE (manuell, durch User):** App-Start mit gespeichertem Gerät (erreichbar / nicht erreichbar), Disconnect während aktivem Tracking.
- **Unit-Tests (Vitest):** Erweiterte Zustands-Tests für `useRadiacodeDevice` — Auto-Connect-Trigger, Status-Übergänge `unavailable` / `reconnecting`. Retry-Queue in Recordern.
- **TSC + Lint:** `npm run check` muss grün sein.

## Risiken & Offene Punkte

- **SwipeRefreshLayout + Leaflet-Map**: potenzieller Touch-Konflikt. Fallback-Plan: `canChildScrollUp` überschreiben oder Pull-to-Refresh auf Map-Page per Capacitor-Plugin deaktivieren. Erst beobachten, dann fixen.
- **Chromium-Version-Verhalten**: `onReceivedError`-Fehlercodes variieren je nach WebView-Version. Wir decken die häufigsten transienten Codes ab und fallen für unbekannte Codes konservativ auf „permanent" zurück (Dialog), um keine echten Fehler zu verschlucken.
- **Auto-Connect-Loop bei Hardware-Defekt**: Backoff + max. N Versuche, dann Status `unavailable`, User muss manuell retriggern.

## Abhängigkeiten / Reihenfolge

Die drei Problembereiche sind weitgehend unabhängig und können parallel von Subagents bearbeitet werden:

1. Agent A — Problem 1 (Android `MainActivity` + NetworkCallback) + Recorder-Retry (Web)
2. Agent B — Problem 2 (RadiacodeProvider Auto-Connect + Status-Machine + UI-Badge)
3. Agent C — Problem 3 (Android `SwipeRefreshLayout` im Layout + `MainActivity`)

Nach erfolgreicher Implementation: `npm run check` gemeinsam ausführen, dann Branch rebasen und in `feat/radiacode-via-bluetooth` mergen.
