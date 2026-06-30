# Android Foreground-Service: wahrnehmbar & über die Notification beendbar

**Datum:** 2026-06-30
**Status:** Design (genehmigt, Ansatz A)
**Plattform:** Android (Capacitor) — `RadiacodeForegroundService`

## Problem

Google Play hat die App abgelehnt (Foreground-Service-Policy):

> Wir haben festgestellt, dass mindestens einer der erklärten Anwendungsfälle nicht
> den Vorgaben zur Verwendung der Berechtigung für Dienste im Vordergrund entspricht.
> Der Nutzer wird insbesondere nicht auf eine Funktion hingewiesen, die eine
> Berechtigung erfordert, wenn sie aktiv ist. Beim Ausführen der Funktion für den
> Connected Device – Connected Device Other ist die Verwendung eines Diensts im
> Vordergrund für den Nutzer nicht wahrnehmbar.

Ziele:

1. Der Hintergrunddienst muss **wahrnehmbar** sein (klar erkennbar, dass eine Funktion
   im Hintergrund läuft, die die Berechtigung benötigt).
2. Der User muss den Dienst **wieder deaktivieren** können.
3. Der Dienst soll **nur laufen, wenn er benötigt wird**.

## Ausgangslage (Code-Stand)

Der `RadiacodeForegroundService` trägt mehrere Modi gleichzeitig:

- **Radiacode-BLE** (`connectedDevice`-FGS-Typ, seit Commit `4bd40d99` nur bei aktiver
  BLE-Session) — Owner in JS: [`RadiacodeProvider`](../../../src/components/providers/RadiacodeProvider.tsx)
- **GPS-Track-Aufzeichnung** (`location`) — Owner: [`useGpsLineRecorder`](../../../src/hooks/recording/useGpsLineRecorder.ts)
- **Live-Standort teilen** (`location`) — Owner: Live-Share-Hook über
  [`nativeGpsTrackBridge`](../../../src/hooks/recording/nativeGpsTrackBridge.ts)

Jeder Modus hat im Service einen eigenen, sauberen Teardown-Pfad
(`ACTION_BLE_DISCONNECT`, `ACTION_STOP_GPS_TRACK`, `ACTION_STOP_LIVE_SHARE`), der den
Service beendet (`stopForeground` + `stopSelf`), sobald der **letzte** Modus weg ist
(siehe [`RadiacodeForegroundService.kt:335-345, 414-426, 470-490`](../../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt)).

**Gaps:**

- Die FGS-Notification hat genau **eine** Action, fest verdrahtet als „Trennen"
  → Event `disconnectRequested` → im JS nur an den Radiacode-Disconnect gehängt
  ([`bleAdapter.capacitor.ts:229`](../../../src/hooks/radiacode/bleAdapter.capacitor.ts#L229),
  [`buildNotification()` in RadiacodeForegroundService.kt:1057-1087`](../../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L1057)).
- Bei einer **reinen GPS-Track-/Live-Share-Session ohne Radiacode** steht trotzdem
  „Trennen" in der Notification und der Button bewirkt **nichts** — diese Modi sind aus
  der Notification nicht beendbar.
- Notification-Body/Channel-Text sind Radiacode-zentriert und machen nicht klar, dass
  die Funktion im Hintergrund weiterläuft.

## Gewählter Ansatz: A — eine modus-bewusste „Beenden"-Action

Eine einzelne Notification-Action, deren **Label und Wirkung** sich an die aktuell
laufenden Modi anpassen. Sie feuert ein generisches `stopRequested`-Event an JS; die
jeweiligen Owner beenden ihren Modus über den bestehenden Stop-Pfad. Der Service beendet
sich nach dem letzten Modus selbst.

**Verworfene Alternativen:**

- **Ansatz B (mehrere Actions, eine pro Modus):** Notifications zeigen max. 3 Actions,
  schnell unübersichtlich; mehr Code/Events; für die Play-Store-Wahrnehmbarkeit kein
  Mehrwert.
- **Bestätigungsdialog beim Start** / **Settings-Schalter:** bewusst nicht gewählt
  (Scope-Entscheidung des Auftraggebers — „Notification verbessern").

Die Feinsteuerung „nur Live-Share stoppen, Radiacode behalten" bleibt **in der App**
erhalten; aus der Notification wird bewusst „alles im Hintergrund beenden" angeboten.

## Designkomponenten

### 1. Notification-Text (Wahrnehmbarkeit)

- `updateNotificationForState()` setzt weiterhin den modus-spezifischen **Titel**.
- Der **Body** bekommt für jeden Modus einen klaren Zusatz, dass die Funktion im
  Hintergrund weiterläuft und über die Notification beendet werden kann
  (z. B. Suffix „· Läuft im Hintergrund").
- Die **Channel-Beschreibung** wird allgemeiner gefasst (nicht nur „Radiacode-Verbindung",
  da der Channel auch GPS-Track und Live-Share trägt).

### 2. Modus-bewusste Action (`buildNotification`)

Action-Label dynamisch nach aktiven Modi:

| Aktive Modi                     | Label                   |
|---------------------------------|-------------------------|
| Radiacode (ggf. + weitere)      | `Trennen`               |
| nur GPS-Track                   | `Aufzeichnung beenden`  |
| nur Live-Share                  | `Teilen beenden`        |
| mehrere Nicht-Radiacode-Modi    | `Im Hintergrund beenden`|

`buildNotification(title, body)` erhält dazu Zugriff auf den aktuellen Modus-Status
(über die bestehenden Felder `radiaCode`, `gpsTrackRecorder`, `trackRecorder`,
`liveLocationPusher`). Die Action feuert eine neue Service-Action
`ACTION_STOP_REQUESTED`.

### 3. Stop-Routing

- Neue Service-Action `ACTION_STOP_REQUESTED` →
  `RadiacodeNotificationPlugin` emittiert ein neues JS-Event `stopRequested`.
- Ein **zentraler JS-Listener** auf `stopRequested` beendet **alle** aktuell aktiven
  Hintergrund-Modi über die bestehenden Owner/Bridges:
  - Radiacode: `nativeDisconnect()`
  - GPS-Track: `stopGpsTrack()`
  - Live-Share: `stopLiveShare()`
- Jeder Aufruf nutzt den vorhandenen Native-Stop-Pfad; der Service beendet sich nach
  dem letzten Modus selbst (keine zusätzliche native Teardown-Logik, damit die in
  [`RadiacodeForegroundService.kt:306-321`](../../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L306)
  dokumentierten Teardown-Races nicht reaktiviert werden).
- `disconnectRequested` (Radiacode-only) bleibt für Abwärtskompatibilität bestehen.

**Ownership-Hinweis:** Das Stoppen läuft bewusst über JS (wie schon heute bei
`disconnectRequested`), damit der React-State (Verbindungs-/Aufzeichnungs-Status in der
UI) konsistent bleibt. Der FGS hält den Prozess am Leben, der Capacitor-Bridge-Pfad ist
also auch bei gesperrtem Screen verfügbar.

### 4. Strings / i18n

- Die FGS-Notification ist **nativ** (nicht über next-intl) → neue Labels/Body-Texte in
  [`strings.xml`](../../../capacitor/android/app/src/main/res/values/strings.xml).
- Bestehender Key `radiacode_notification_action_disconnect` bleibt; neue Keys für die
  weiteren Action-Labels (`..._action_stop_track`, `..._action_stop_share`,
  `..._action_stop_background`) und optional einen Body-Suffix.

## Nicht im Scope

- Kein neuer Settings-Schalter „Hintergrundbetrieb erlauben".
- Kein Bestätigungsdialog beim Start einer hintergrundfähigen Funktion.
- Keine Änderung an der `connectedDevice`-/`location`-Typ-Logik (bereits durch
  `4bd40d99` adressiert).
- Keine Anpassung der Play-Console-Use-Case-Deklaration (separater, nicht-Code-Schritt;
  ggf. als Hinweis im PR vermerken).

## Testplan

- **Unit/JS:** `stopRequested`-Listener beendet bei verschiedenen Modus-Kombinationen die
  jeweils aktiven Modi (Radiacode / GPS / Live / Kombinationen). Tests mit Vitest, neben
  der Quelldatei (`*.test.ts`).
- **Manuell (Gerät):**
  1. Nur GPS-Track starten → Notification zeigt „Aufzeichnung beenden"; Tippen beendet
     Track + Service.
  2. Nur Live-Share starten → „Teilen beenden" beendet Live-Share + Service.
  3. GPS-Track + Live-Share → „Im Hintergrund beenden" beendet beide + Service.
  4. Radiacode verbunden (+ ggf. Track) → „Trennen" trennt Radiacode (bestehender Pfad
     unverändert).
  5. Screen gesperrt / App im Hintergrund: Notification-Action funktioniert weiterhin.
- **Build:** `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npx next build --webpack`;
  Android-Build mit JDK 21 (`./gradlew :app:assembleDebug`).
