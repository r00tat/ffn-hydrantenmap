# Permission-Onboarding (Android)

**Datum:** 2026-05-02
**Branch:** `feat/permission-onboarding`
**Scope:** Capacitor-Android-App (Web-PWA bleibt unverändert)

## Ziel

Beim ersten Start der nativen Android-App durchläuft der User einen kurzen
Erklär-Wizard, der pro Permission eine Info-Karte zeigt und auf Tippen den
Android-System-Dialog auslöst. Nach dem Wizard wird die Entscheidung
persistiert; der Wizard erscheint nicht erneut. Wenn ein Feature später eine
abgelehnte Permission braucht, versucht die App den Request erneut — bei
„permanently denied" wird ein Dialog gezeigt, der zu den
System-App-Einstellungen verlinkt.

## Anforderungen (alle bestätigt)

- **Scope:** drei Permissions im Wizard — Standort, Bluetooth, Notifications.
- **Plattform:** nur Capacitor-Android. Web-PWA bleibt wie heute (Browser
  handhabt Permissions JIT).
- **Skip-Option:** jede Karte hat „Erlauben" + „Später".
- **Trigger:** Wizard erscheint vor dem Login-Screen, einmalig.
- **JIT-Fallback:** wenn ein Feature später eine fehlende Permission braucht,
  wird `request` versucht. Bei „permanently denied" Settings-Deeplink-Dialog.
- **Tooling:** bestehende Plugins (`@capacitor/geolocation`,
  `@capacitor-community/bluetooth-le`) für die Permission-Requests, eigenes
  Mini-Plugin `AppPermissions` für Settings-Deeplink und einheitlichen
  Permission-State (inkl. „permanently denied"-Erkennung via
  `shouldShowRequestPermissionRationale`).

## Reihenfolge der Permissions

1. **Standort** — wichtigste & häufigste Permission (Karte mit eigener
   Position, GPS-Tracking).
2. **Bluetooth** — für Radiacode-Strahlungsmessgeräte.
3. **Notifications** — für die Foreground-Service-Notification, die während
   des Radiacode-Hintergrund-Trackings sichtbar bleibt. (FCM-Push für
   Einsatz-Alarme wird in der nativen App **nicht** verwendet — kein natives
   FCM-Plugin installiert.)

Bluetooth & Notifications stehen direkt hintereinander, beide haben „Radiacode"
im Erklärungstext — der Zusammenhang ist für den User klar.

## Architektur-Übersicht

Drei Schichten, von unten nach oben:

### 1. Native Schicht — `AppPermissionsPlugin.kt`

Neue Datei
`capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/AppPermissionsPlugin.kt`.

```kotlin
@CapacitorPlugin(
    name = "AppPermissions",
    permissions = [
        Permission(alias = "location", strings = [
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ]),
        Permission(alias = "notifications", strings = [
            Manifest.permission.POST_NOTIFICATIONS,
        ]),
        Permission(alias = "bluetooth", strings = [
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_CONNECT,
        ]),
    ]
)
class AppPermissionsPlugin : Plugin()
```

Drei Methoden:

- `checkPermission({type})` → `{state}`: liest aktuellen System-Status und
  liefert `'granted' | 'denied' | 'prompt' | 'permanentlyDenied'`.
- `requestPermission({type})` → `{state}`: setzt vorher
  `hasRequested:<perm> = true` in `SharedPreferences`, ruft dann den
  System-Dialog über Capacitor's `requestPermissionForAliases`. Antwort
  kommt via `@PermissionCallback`-Funktion, die `computeState()` neu evaluiert.
- `openAppSettings()`: feuert
  `Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, …)` mit
  `package:<applicationId>`.

**State-Berechnung:**

```
val granted = perms.all { checkSelfPermission(it) == GRANTED }
if (granted) return "granted"
val askedBefore = perms.any { sharedPrefs.getBoolean("hasRequested:$it", false) }
if (!askedBefore) return "prompt"
val anyRationaleNeeded = perms.any {
    ActivityCompat.shouldShowRequestPermissionRationale(activity, it)
}
return if (anyRationaleNeeded) "denied" else "permanentlyDenied"
```

**Versions-Notiz:** `POST_NOTIFICATIONS` existiert ab API 33; `BLUETOOTH_SCAN`/
`BLUETOOTH_CONNECT` ab API 31. Auf älteren API-Levels gibt das Plugin direkt
`granted` zurück (Legacy-Permissions sind im Manifest mit
`maxSdkVersion="30"` deklariert und werden beim Install gewährt).

**Registrierung:** in `MainActivity.onCreate()`:

```java
registerPlugin(AppPermissionsPlugin.class);
```

### 2. TypeScript-Schicht — `src/lib/permissions/`

**`AppPermissions.ts`** — Capacitor-Plugin-Proxy:

```ts
export type PermissionType = 'location' | 'notifications' | 'bluetooth';
export type PermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'permanentlyDenied';

export interface AppPermissionsPlugin {
  checkPermission(opts: { type: PermissionType }):
    Promise<{ state: PermissionState }>;
  requestPermission(opts: { type: PermissionType }):
    Promise<{ state: PermissionState }>;
  openAppSettings(): Promise<void>;
}

export const AppPermissions =
  registerPlugin<AppPermissionsPlugin>('AppPermissions');
```

**`index.ts`** — drei Helfer plus interner Kombinator:

- `ensureLocation(): Promise<boolean>`
- `ensureBluetooth(): Promise<boolean>`
- `ensureNotifications(): Promise<boolean>`
- `openAppSettings(): Promise<void>` (Pass-Through)

Interner Kombinator:

```
ensure(type, message):
  if (!Capacitor.isNativePlatform()) return true
  state = AppPermissions.checkPermission({type}).state
  if (state === 'granted') return true
  if (state === 'permanentlyDenied') {
    triggerSettingsDialog({type, message})
    return false
  }
  state = AppPermissions.requestPermission({type}).state
  if (state === 'granted') return true
  if (state === 'permanentlyDenied') {
    triggerSettingsDialog({type, message})
    return false
  }
  return false  // 'denied' — Feature meldet sich selbst per Snackbar
```

**Settings-Dialog-Triggering** über einen schlanken Event-Bus
(`settingsDialog.ts`, `subscribe`/`trigger`-Pattern), damit `ensure()` aus
jedem Kontext den Dialog öffnen kann, ohne als React-Hook implementiert zu sein.

### 3. React-UI-Schicht — `src/components/permissions/`

```
PermissionOnboardingProvider.tsx     ← Mount-Point im Root-Layout
  └─ PermissionOnboardingWizard.tsx  ← MUI Dialog (fullscreen) mit Stepper
       └─ PermissionStep.tsx         ← eine Karte (3 Instanzen)

SettingsRedirectDialogProvider.tsx   ← horcht via subscribe()
  └─ SettingsRedirectDialog.tsx      ← MUI Dialog für JIT-Fallback
```

**`PermissionOnboardingProvider`-Logik:**

- `Capacitor.isNativePlatform() === false` → render `children`.
- `Preferences.get('permissionOnboardingCompleted') === '1'` → render
  `children`.
- Sonst → Wizard rendern, danach Flag setzen und `children` rendern.

**`PermissionOnboardingWizard`:**

- MUI `Dialog` mit `fullScreen={true}`, nicht schliessbar (kein X, kein
  Backdrop-Close).
- Header: App-Logo + Titel „Berechtigungen einrichten".
- Body: aktueller `<PermissionStep>`.
- Footer: MUI `MobileStepper` (3 Punkte) zur Orientierung.

**`PermissionStep`-Inhalte:**

| # | Icon (MUI) | Titel | Beschreibung |
|---|---|---|---|
| 1 | `LocationOnIcon` | Standort | „Damit dein Standort auf der Einsatzkarte angezeigt wird und GPS-Tracks aufgezeichnet werden können, benötigt die App Zugriff auf deinen Standort." |
| 2 | `BluetoothIcon` | Bluetooth | „Für die Verbindung zu Radiacode-Strahlungsmessgeräten benötigt die App Zugriff auf Bluetooth. Wenn du keine Radiacode-Geräte verwendest, kannst du diesen Schritt überspringen." |
| 3 | `NotificationsIcon` | Mitteilungen | „Während die Radiacode-Aufzeichnung im Hintergrund läuft, zeigt die App eine Benachrichtigung an. Dafür benötigt sie die Erlaubnis, Mitteilungen anzuzeigen. Wenn du keine Radiacode-Geräte verwendest, kannst du diesen Schritt überspringen." |

Pro Step zwei Buttons: „Erlauben" (`variant="contained"`) ruft
`AppPermissions.requestPermission({type})`. „Später" (`variant="text"`)
springt direkt zum nächsten Step.

**`SettingsRedirectDialog`:**

- MUI `Dialog`, modal, schliessbar.
- Titel & Body type-spezifisch (`'Standort blockiert'`, …).
- Buttons: „Einstellungen öffnen" → `AppPermissions.openAppSettings()`,
  „Abbrechen" → schliesst.

## Datenfluss

### Wizard-Flow (erster Start)

```
App-Launch
  → PermissionOnboardingProvider lädt
    → Capacitor.isNativePlatform()?  Nein → children
      Ja
    → Preferences.get('permissionOnboardingCompleted') === '1'?
      Ja → children
      Nein → Wizard
    → Step 1: Standort
        Erlauben → AppPermissions.requestPermission({type:'location'})
        Später   → next
    → Step 2: Bluetooth
        Erlauben → AppPermissions.requestPermission({type:'bluetooth'})
        Später   → next
    → Step 3: Notifications
        Erlauben → AppPermissions.requestPermission({type:'notifications'})
        Später   → next
    → Preferences.set('permissionOnboardingCompleted', '1')
    → Wizard unmounted → children (Login-Screen)
```

### JIT-Fallback (später, im laufenden App-Betrieb)

```
User triggert Feature (Lokalisieren / Radiacode-Connect / FCM-Token)
  → ensureXxx()
    → AppPermissions.checkPermission({type})
    → granted?            → return true → Feature läuft
    → permanentlyDenied?  → SettingsRedirectDialog (mit Open-Settings-Button)
                            → return false
    → sonst:
      AppPermissions.requestPermission({type})
      → granted?            → return true → Feature läuft
      → permanentlyDenied?  → SettingsRedirectDialog → return false
      → sonst (denied)      → return false (Snackbar im Aufrufer)
```

## Integration in bestehende Aufruf-Sites

Drei minimale Änderungen, jede Aufrufstelle ruft `ensureXxx()` vor dem
Feature-Aufruf:

### `src/hooks/usePosition.ts`

`startWatching()` ruft `ensureLocation()` vor `navigator.geolocation.
watchPosition()`. Auf Web returnt `ensureLocation()` direkt `true` und der
bestehende Pfad bleibt unverändert.

### `src/hooks/radiacode/bleAdapter.capacitor.ts`

In `connect()` wird vor `nativeConnect(deviceId)` eine `ensureNotifications()`
und in `requestDevice()` eine `ensureBluetooth()` ergänzt. Bei `false` bricht
der Connect-Flow kontrolliert ab (kein flackernder System-Dialog mid-flow).

### `src/components/firebase/messaging.ts`

`requestPermission()` wird auf `Capacitor.isNativePlatform()` verzweigt: native
geht über `ensureNotifications()`, web bleibt beim bestehenden
`Notification.requestPermission()`-Pfad.

### Cleanup im bestehenden Plugin

`RadiacodeNotificationPlugin.connectNative()` ruft heute selbst
`requestPermissionForAlias("notifications", …)` auf
([Zeile 72-77](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java)).
Mit der neuen Architektur wird Notifications bereits JS-seitig in
`bleAdapter.capacitor.ts` via `ensureNotifications()` geklärt, **bevor** das
native Plugin aufgerufen wird. Der Permission-Block im Plugin kann dann
gelöscht werden.

## Persistenz

`@capacitor/preferences` mit Key `permissionOnboardingCompleted = '1'`.
Einmal gesetzt nach Wizard-Abschluss (egal ob alles erlaubt oder nicht).

**Edge-Cases:**

- **Reinstall der App:** Preferences sind weg → Wizard zeigt erneut.
  System-Permissions ebenfalls zurückgesetzt → System-Dialoge erscheinen
  normal. Konsistent.
- **App-Update fügt neue Permission hinzu:** Out of Scope. Falls später z. B.
  Kamera dazukommt, wird ein versionierter Flag-Key (`permissionOnboardingV2`)
  eingeführt, der nur die neue Karte zeigt.

## Tests

**Vitest:**

- `src/lib/permissions/permissions.test.ts` — mockt `AppPermissions`-Plugin,
  testet alle `ensureXxx()`-Verzweigungen (granted / denied /
  permanentlyDenied / web).
- `src/components/permissions/PermissionStep.test.tsx` — Render-Test, Click
  „Erlauben" ruft Plugin, „Später" callbackt mit `'skipped'`.
- `src/components/permissions/PermissionOnboardingWizard.test.tsx` —
  Step-Progression, Stepper-State, Completion-Callback.
- `src/components/permissions/PermissionOnboardingProvider.test.tsx` — Web →
  kein Wizard; Native + Flag → kein Wizard; Native + kein Flag → Wizard.
- `src/components/permissions/SettingsRedirectDialog.test.tsx` — Open/Close,
  „Einstellungen öffnen" ruft Plugin.

**Bestehende Tests anpassen:**

- `src/components/firebase/messaging.test.ts` — `ensureNotifications()` mocken,
  beide Zweige (native/web) testen.

**Nativ:** keine Unit-Tests für `AppPermissionsPlugin.kt` — verifizieren wir
manuell auf einem Test-Gerät (Android 12 ohne POST_NOTIFICATIONS-Permission,
Android 13+ mit POST_NOTIFICATIONS, Android 11 mit Legacy-Bluetooth).

## Out of Scope

- Natives FCM-Plugin (`@capacitor-firebase/messaging`) für Einsatz-Alarme in
  der nativen App. Wird derzeit ohnehin nicht versendet — kein offener Punkt.
- iOS-Pfad. iOS hat anderes Permission-Modell (kein
  `shouldShowRequestPermissionRationale`); dafür wäre ein Swift-Pendant
  nötig. Nicht jetzt.
- Versionierte Onboarding-Flags für zukünftige Permissions. Erst einführen,
  wenn tatsächlich eine neue Permission dazukommt.
