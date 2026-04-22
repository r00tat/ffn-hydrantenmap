# Native-App-Stabilität und Pull-to-Refresh — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Android-WebView erholt sich automatisch von Netzwerkwechseln, Radiacode-BLE verbindet sich automatisch mit gespeichertem Gerät, und Pull-to-Refresh in der nativen App löst einen Reload aus.

**Architecture:** (1) `MainActivity.java` kategorisiert Netzwerk-Fehler, überlagert die Chromium-Error-Page mit eigenem Offline-Overlay und reloaded via `ConnectivityManager.NetworkCallback`. (2) `useRadiacodeDevice`/`RadiacodeProvider` erhalten Auto-Connect + erweiterte Status-Machine (`reconnecting`/`unavailable`). (3) `SwipeRefreshLayout` umschließt die WebView in `activity_main.xml`, `onRefresh` → `webView.reload()`.

**Tech Stack:** Capacitor 8 / Android WebView / AndroidX SwipeRefreshLayout; React 19 / TypeScript / Vitest / MUI.

**Referenz-Design:** [2026-04-21-native-app-stability-design.md](./2026-04-21-native-app-stability-design.md)

---

## Parallele Workstreams

Die drei Workstreams sind unabhängig und können parallel von drei Subagents bearbeitet werden. Jeder Subagent committet in denselben Branch `feat/native-app-stability` und arbeitet nur in den ihm zugewiesenen Dateien.

- **Workstream A — WebView-Stabilität (Android)**: Tasks A1–A4
- **Workstream B — Radiacode-Auto-Connect**: Tasks B1–B3
- **Workstream C — Pull-to-Refresh (Android)**: Tasks C1–C2

---

## Workstream A — WebView-Stabilität (Android)

Datei-Scope (exklusiv):
- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java`
- `capacitor/android/app/src/main/res/values/strings.xml` (neue String-Ressourcen)

### Task A1: Fehlerkategorisierung in `onReceivedError`

**Files:**
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java`
- Modify: `capacitor/android/app/src/main/res/values/strings.xml` (neue Strings für Offline-Overlay)

**Step 1: Neue Strings in `strings.xml` ergänzen**

Füge folgende `<string>`-Einträge vor dem schließenden `</resources>` ein:

```xml
    <string name="offline_overlay_title">Keine Verbindung</string>
    <string name="offline_overlay_message">Einsatzkarte wartet auf Netzwerk…</string>
    <string name="offline_overlay_retry">Jetzt erneut versuchen</string>
```

**Step 2: `MainActivity.java` anpassen — Fehlerkategorisierung + Offline-Overlay**

- Importe ergänzen:
  ```java
  import android.net.ConnectivityManager;
  import android.net.Network;
  import android.os.Handler;
  import android.os.Looper;
  import java.util.HashSet;
  import java.util.Set;
  ```
- Neue Felder in der Klasse:
  ```java
  private boolean offlineOverlayShown = false;
  private String lastRequestedUrl = null;
  private ConnectivityManager.NetworkCallback networkCallback = null;
  private final Handler retryHandler = new Handler(Looper.getMainLooper());
  private static final Set<Integer> TRANSIENT_ERRORS = new HashSet<>();
  static {
      TRANSIENT_ERRORS.add(android.webkit.WebViewClient.ERROR_CONNECT);
      TRANSIENT_ERRORS.add(android.webkit.WebViewClient.ERROR_HOST_LOOKUP);
      TRANSIENT_ERRORS.add(android.webkit.WebViewClient.ERROR_TIMEOUT);
      TRANSIENT_ERRORS.add(android.webkit.WebViewClient.ERROR_IO);
      TRANSIENT_ERRORS.add(android.webkit.WebViewClient.ERROR_PROXY_AUTHENTICATION);
  }
  ```
- `onPageStarted` erweitern: `lastRequestedUrl = url;` sowie `offlineOverlayShown = false;` nur wenn URL != `about:blank`.
- `onReceivedError` ersetzen (nur Main-Frame-Verhalten ändern):
  ```java
  @Override
  public void onReceivedError(
      WebView view,
      WebResourceRequest request,
      WebResourceError error
  ) {
      super.onReceivedError(view, request, error);
      if (!request.isForMainFrame()) return;
      int code = error.getErrorCode();
      String url = request.getUrl().toString();
      if (TRANSIENT_ERRORS.contains(code)) {
          showOfflineOverlay(url);
      } else {
          showLoadErrorDialog(
              url,
              error.getDescription() + " (Code " + code + ")"
          );
      }
  }
  ```
- Neue Methode `showOfflineOverlay(String url)`:
  ```java
  private void showOfflineOverlay(String url) {
      if (offlineOverlayShown) return;
      offlineOverlayShown = true;
      lastRequestedUrl = url;
      String html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
          + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
          + "<style>body{font-family:system-ui,-apple-system,sans-serif;"
          + "background:#111;color:#eee;display:flex;flex-direction:column;"
          + "align-items:center;justify-content:center;height:100vh;margin:0;"
          + "padding:16px;text-align:center}"
          + "h1{font-size:20px;margin:0 0 8px}"
          + "p{margin:0 0 24px;opacity:.8}"
          + "button{background:#d32f2f;color:#fff;border:0;border-radius:8px;"
          + "padding:12px 24px;font-size:16px}</style></head><body>"
          + "<h1>" + getString(R.string.offline_overlay_title) + "</h1>"
          + "<p>" + getString(R.string.offline_overlay_message) + "</p>"
          + "<button onclick=\"window.location.reload()\">"
          + getString(R.string.offline_overlay_retry) + "</button></body></html>";
      runOnUiThread(() -> {
          bridge.getWebView().loadDataWithBaseURL(
              url, html, "text/html", "UTF-8", url
          );
      });
  }
  ```

**Step 3: Verifikation (manueller Android-Build)**

```bash
cd capacitor/android
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`. Kompilierfehler werden sofort angezeigt.

**Step 4: Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java \
        capacitor/android/app/src/main/res/values/strings.xml
git commit -m "feat(android): Offline-Overlay bei transienten WebView-Fehlern"
```

---

### Task A2: `ConnectivityManager.NetworkCallback` registrieren

**Files:**
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java`

**Step 1: Registrierung in `onCreate`**

Nach dem bestehenden `setWebViewClient(...)`-Block in `onCreate` einfügen:

```java
ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
if (cm != null) {
    networkCallback = new ConnectivityManager.NetworkCallback() {
        @Override
        public void onAvailable(Network network) {
            if (offlineOverlayShown) {
                runOnUiThread(() -> {
                    offlineOverlayShown = false;
                    if (lastRequestedUrl != null) {
                        bridge.getWebView().loadUrl(lastRequestedUrl);
                    } else {
                        bridge.getWebView().reload();
                    }
                });
            }
        }
    };
    cm.registerDefaultNetworkCallback(networkCallback);
}
```

**Step 2: Deregistrierung in `onDestroy`**

```java
@Override
public void onDestroy() {
    if (networkCallback != null) {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm != null) {
            try {
                cm.unregisterNetworkCallback(networkCallback);
            } catch (IllegalArgumentException ignored) {
                // already unregistered
            }
        }
        networkCallback = null;
    }
    retryHandler.removeCallbacksAndMessages(null);
    super.onDestroy();
}
```

**Step 3: Backoff-Retry als Sicherheitsnetz**

In `showOfflineOverlay(String url)` vor `runOnUiThread` einfügen:

```java
retryHandler.removeCallbacksAndMessages(null);
retryHandler.postDelayed(() -> {
    if (offlineOverlayShown) {
        offlineOverlayShown = false;
        bridge.getWebView().loadUrl(url);
    }
}, 5000);
```

(5 s Backup-Reload; `NetworkCallback.onAvailable` löst in der Regel früher aus.)

**Step 4: Build verifizieren**

```bash
cd capacitor/android
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

**Step 5: Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java
git commit -m "feat(android): NetworkCallback reloaded WebView bei Netzwerk-Recovery"
```

---

### Task A3 (optional, defensiv): Recorder-Loop-Resilienz

*Nur umsetzen, falls nach Task A1+A2 noch Einzelfehler durch Firestore-Fehler auftreten — ansonsten skippen (YAGNI).*

**Files:**
- Modify: `src/hooks/recording/useGpsLineRecorder.ts:112-152`

Anpassung: Der bestehende Effect ([`useGpsLineRecorder.ts:126-129`](../../src/hooks/recording/useGpsLineRecorder.ts#L126-L129)) feuert `addPos` bereits fire-and-forget; ein Einzelfehler hält das Recording nicht an. **Keine Änderung nötig** — Task überspringen, Kommentar im Design-Doc verankern.

---

### Task A4: Smoke-Verify (manuell)

**Files:** keine

- User testet nach Merge: Flugmodus an/aus auf Startseite, WLAN↔LTE-Wechsel während aktivem Track.

---

## Workstream B — Radiacode-Auto-Connect

Datei-Scope (exklusiv):
- `src/hooks/radiacode/useRadiacodeDevice.ts`
- `src/hooks/radiacode/useRadiacodeDevice.test.ts`
- `src/components/providers/RadiacodeProvider.tsx`
- `src/components/providers/RadiacodeProvider.test.tsx` (falls vorhanden — sonst nicht neu erstellen, YAGNI)

### Task B1: Status-Machine erweitern (`unavailable`, `reconnecting`) — TDD

**Files:**
- Modify: `src/hooks/radiacode/useRadiacodeDevice.ts`
- Test: `src/hooks/radiacode/useRadiacodeDevice.test.ts`

**Step 1: Failing-Tests schreiben**

Prüfe zuerst, ob `useRadiacodeDevice.test.ts` existiert. Falls nicht: neu erstellen. Füge/ergänze folgende Testfälle (Vitest + React Testing Library):

```ts
// Ergänzungen im Testfile

describe('useRadiacodeDevice — unavailable/reconnecting', () => {
  it('setzt Status auf "unavailable", wenn connect() fehlschlägt', async () => {
    const adapter = {
      isSupported: () => true,
      requestDevice: vi.fn(),
      connect: vi.fn().mockRejectedValue(new Error('timeout')),
      disconnect: vi.fn(),
      onNotification: vi.fn(),
      write: vi.fn(),
    };
    const { result } = renderHook(() => useRadiacodeDevice(adapter));
    await act(async () => {
      await result.current.connect({ id: 'abc', name: 'Test' });
    });
    expect(result.current.status).toBe('unavailable');
    expect(result.current.error).toContain('timeout');
  });

  it('wechselt bei unerwartetem Disconnect in "reconnecting" und versucht erneut', async () => {
    // Details je nach BleAdapter-Struktur; minimal: connect() succeeds,
    // dann triggert adapter.onDisconnect callback -> Status 'reconnecting',
    // nach successful reconnect -> 'connected'.
    // Siehe Hinweis unten, falls onDisconnect im Adapter nicht existiert.
  });
});
```

*Hinweis zum zweiten Test:* Falls der `BleAdapter` keinen `onDisconnect`-Hook anbietet, den Test stattdessen auf „nach Fehler bei `client.startPolling` → `reconnecting` bis max. 3 Versuche, dann `unavailable`" formulieren. Konkrete Form an der Client-API ausrichten — die API befindet sich in `src/hooks/radiacode/client.ts`. Vor Testformulierung einen Blick in `client.ts` werfen.

**Step 2: Tests ausführen — müssen fehlschlagen**

```bash
NO_COLOR=1 npm run test -- src/hooks/radiacode/useRadiacodeDevice.test.ts
```

Expected: FAIL (Status `'unavailable'` existiert noch nicht).

**Step 3: `RadiacodeStatus`-Type erweitern**

In [`src/hooks/radiacode/useRadiacodeDevice.ts:6-11`](../../src/hooks/radiacode/useRadiacodeDevice.ts#L6-L11):

```ts
export type RadiacodeStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'
  | 'error';
```

**Step 4: `connect`-Logik anpassen**

In [`useRadiacodeDevice.ts:109-112`](../../src/hooks/radiacode/useRadiacodeDevice.ts#L109-L112): Catch-Block so anpassen, dass bei Connect-Fehlschlag `setStatus('unavailable')` statt `'error'` gesetzt wird. `'error'` bleibt für unerwartete JS-Fehler.

```ts
} catch (e) {
  setError(e instanceof Error ? e.message : String(e));
  setStatus('unavailable');
}
```

**Step 5: Tests ausführen — müssen passen**

```bash
NO_COLOR=1 npm run test -- src/hooks/radiacode/useRadiacodeDevice.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/hooks/radiacode/useRadiacodeDevice.ts \
        src/hooks/radiacode/useRadiacodeDevice.test.ts
git commit -m "feat(radiacode): Status-Machine um unavailable-State erweitert"
```

---

### Task B2: Auto-Connect in `RadiacodeProvider`

**Files:**
- Modify: `src/components/providers/RadiacodeProvider.tsx:157-159`

**Step 1: Bestehenden Default-Device-Load-Effect erweitern**

Der aktuelle Effect lädt nur, `connect` wird nicht getriggert. Ändere ihn zu:

```tsx
// Load default device on mount, auto-connect if present
useEffect(() => {
  let cancelled = false;
  (async () => {
    const saved = await loadDefaultDevice().catch(() => null);
    if (!saved || cancelled) return;
    // Attempt auto-connect. If unavailable, status wird auf 'unavailable' gesetzt.
    await connectRaw(saved).catch(() => null);
  })();
  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [adapter]);
```

Wichtig: Dependency-Array enthält `adapter`, damit der Auto-Connect erst läuft, wenn der echte Adapter aus `getBleAdapter()` geladen ist (nicht bei `NULL_ADAPTER`).

**Step 2: Verifikation — manuell**

```bash
NO_COLOR=1 npm run test
NO_COLOR=1 npm run lint
```

Expected: Alles grün.

**Step 3: Commit**

```bash
git add src/components/providers/RadiacodeProvider.tsx
git commit -m "feat(radiacode): Auto-Connect beim Mount bei gespeichertem Gerät"
```

---

### Task B3: UI-Status-Anzeige im TrackStartDialog / Dosimetrie

**Files:**
- Modify: `src/components/Map/TrackStartDialog.tsx` (Radiacode-Abschnitt, sofern vorhanden)
- Modify: `src/components/pages/DosimetriePage.tsx` (oder vergleichbare Radiacode-UI) — nur Status-Badge, kein Rework

**Step 1: Status-Anzeige hinzufügen**

Lies zunächst `TrackStartDialog.tsx` und die Dosimetrie-Seite. Ergänze an Stellen, an denen der User „Start Tracking" klickt oder den BLE-Status sieht, ein simples MUI-`Chip` oder kleines Badge:

```tsx
const statusLabel: Record<RadiacodeStatus, string> = {
  idle: 'Nicht verbunden',
  scanning: 'Suche Gerät…',
  connecting: 'Verbinde…',
  connected: 'Verbunden',
  reconnecting: 'Verbinde neu…',
  unavailable: 'Gerät nicht erreichbar',
  error: 'Fehler',
};
const statusColor: Record<RadiacodeStatus, 'default' | 'success' | 'warning' | 'error'> = {
  idle: 'default',
  scanning: 'warning',
  connecting: 'warning',
  connected: 'success',
  reconnecting: 'warning',
  unavailable: 'error',
  error: 'error',
};
<Chip size="small" color={statusColor[status]} label={statusLabel[status]} />
```

**Step 2: Start-Tracking-Button gatekeepen**

Falls im `TrackStartDialog` ein Radiacode-Tracking-Button existiert: `disabled` setzen, wenn `status !== 'connected'`. Falls das zu einem disabled MUI-Button in einem Tooltip führt, den `<span>`-Wrapper nicht vergessen (CLAUDE.md Regel).

**Step 3: Verifikation**

```bash
NO_COLOR=1 npm run test
NO_COLOR=1 npm run lint
```

Expected: Alles grün.

**Step 4: Commit**

```bash
git add src/components/Map/TrackStartDialog.tsx \
        src/components/pages/DosimetriePage.tsx
git commit -m "feat(radiacode): Status-Badge und Gate für Start-Tracking"
```

---

## Workstream C — Pull-to-Refresh (Android nativ)

Datei-Scope (exklusiv):
- `capacitor/android/app/build.gradle` (Dependency)
- `capacitor/android/app/src/main/res/layout/activity_main.xml`
- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java` (nur SwipeRefresh-Setup, nicht mit Workstream A kollidieren)
- `capacitor/android/app/src/main/res/values/colors.xml` (falls kein `colorPrimary` existiert)

### Task C1: SwipeRefreshLayout als Dependency + Layout

**Files:**
- Modify: `capacitor/android/app/build.gradle`
- Modify: `capacitor/android/app/src/main/res/layout/activity_main.xml`

**Step 1: Gradle-Dependency ergänzen**

In `capacitor/android/app/build.gradle` im `dependencies { … }`-Block:

```groovy
    implementation "androidx.swiperefreshlayout:swiperefreshlayout:1.1.0"
```

**Step 2: Layout umschließen**

`activity_main.xml` ersetzen durch:

```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.coordinatorlayout.widget.CoordinatorLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context=".MainActivity">

    <androidx.swiperefreshlayout.widget.SwipeRefreshLayout
        android:id="@+id/swipe_refresh"
        android:layout_width="match_parent"
        android:layout_height="match_parent">

        <WebView
            android:layout_width="match_parent"
            android:layout_height="match_parent" />
    </androidx.swiperefreshlayout.widget.SwipeRefreshLayout>
</androidx.coordinatorlayout.widget.CoordinatorLayout>
```

**Step 3: Gradle-Sync + Build**

```bash
cd capacitor/android
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

**Step 4: Commit**

```bash
git add capacitor/android/app/build.gradle \
        capacitor/android/app/src/main/res/layout/activity_main.xml
git commit -m "chore(android): SwipeRefreshLayout-Dependency und Layout-Wrap"
```

---

### Task C2: `MainActivity` — SwipeRefresh-Listener + Scroll-Gating

**Files:**
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java`

**Step 1: Imports ergänzen**

```java
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import android.webkit.WebView;
```

**Step 2: Feld**

```java
private SwipeRefreshLayout swipeRefreshLayout = null;
```

**Step 3: Setup in `onCreate` (nach `super.onCreate` und vor der bestehenden WebViewClient-Konfiguration)**

```java
swipeRefreshLayout = findViewById(R.id.swipe_refresh);
if (swipeRefreshLayout != null) {
    WebView webView = this.bridge.getWebView();
    swipeRefreshLayout.setOnRefreshListener(() -> webView.reload());
    // Nur triggern, wenn WebView ganz oben gescrollt ist (Standard-Verhalten).
    // Leaflet scrollt die WebView selbst nicht, der Touch-Konflikt ist somit
    // primär auf der Karte relevant und wird ggf. in einem Folge-Task behandelt.
}
```

**Step 4: `setRefreshing(false)` in `onPageFinished`**

In der anonymous-class `BridgeWebViewClient`-Subclass eine `onPageFinished`-Override ergänzen (oder erweitern, falls existiert):

```java
@Override
public void onPageFinished(WebView view, String url) {
    super.onPageFinished(view, url);
    if (swipeRefreshLayout != null) {
        swipeRefreshLayout.setRefreshing(false);
    }
}
```

**Step 5: Build verifizieren**

```bash
cd capacitor/android
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

**Step 6: Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java
git commit -m "feat(android): Pull-to-Refresh via SwipeRefreshLayout"
```

---

## Abschluss-Tasks (sequenziell nach A+B+C)

### Task Z1: Gesamt-Verifikation

```bash
git checkout -- next-env.d.ts 2>/dev/null || true
NO_COLOR=1 npm run check
```

Expected: `tsc` OK, ESLint OK, Vitest alle Tests grün, Next.js Build OK.

### Task Z2: Android-Build

```bash
cd capacitor/android
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

### Task Z3: Rebase auf `feat/radiacode-via-bluetooth`

```bash
git fetch origin
git rebase feat/radiacode-via-bluetooth
```

Bei Konflikten: auflösen, `git add <files>`, `git rebase --continue`. Keine destruktiven Flags.

### Task Z4: Merge zurück in `feat/radiacode-via-bluetooth`

```bash
# Aus dem Haupt-Worktree:
cd /Users/paul/Documents/Feuerwehr/hydranten-map
git checkout feat/radiacode-via-bluetooth
git merge --no-ff feat/native-app-stability -m "Merge branch 'feat/native-app-stability' into feat/radiacode-via-bluetooth"
```

### Task Z5: Worktree-Cleanup (nach erfolgreichem Merge)

```bash
git worktree remove /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/native-app-stability
```

---

## Commit-Konventionen (aus CLAUDE.md)

- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Keine `Co-Authored-By`-Zeilen.
- Separater `git add` und `git commit`-Aufruf.
- Keine Änderungen an `next-env.d.ts` im Commit.

## Risiken & Kontrollen

- **SwipeRefresh-Touch-Konflikt mit Leaflet**: Falls in manuellem Test beobachtet, Folge-Task: `SwipeRefreshLayout.setEnabled(false)` auf Map-Routen via Bridge-Plugin.
- **NetworkCallback-API-Level**: `registerDefaultNetworkCallback` ist ab API 24 verfügbar. `minSdkVersion` des Projekts prüfen, falls < 24: auf `registerNetworkCallback` mit `NetworkRequest` umstellen.
- **Offline-Overlay-Loop**: `loadDataWithBaseURL` selbst kann `onReceivedError` nicht erneut triggern (HTML ist inline). Kein Loop-Risiko.
