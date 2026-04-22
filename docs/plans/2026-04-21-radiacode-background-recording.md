# RadiaCode Background Recording Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Radiacode-Track-Aufzeichnung läuft auf Android weiter, wenn der
Bildschirm gesperrt wird oder das Gerät in den Standby geht. Aktuell friert
der Polling-Loop im WebView ein, sobald das Display aus ist — auch wenn der
Foreground-Service weiterläuft.

**Architecture:** Der bestehende `RadiacodeForegroundService` hält lediglich
eine laufende Notification, akquiriert aber keinen `PARTIAL_WAKE_LOCK`. Ohne
WakeLock drosselt Android den CPU-Takt, sobald das Display aus ist; die BLE-
GATT-Callbacks des `@capacitor-community/bluetooth-le`-Plugins und die
`setTimeout`-basierten Polling-Schleifen im WebView werden dadurch eingefroren
bzw. stark verlangsamt. Diese Änderung akquiriert einen
`PowerManager.PARTIAL_WAKE_LOCK` beim Start des Service (Recording-Beginn) und
gibt ihn wieder frei, wenn der Service gestoppt wird. Zusätzlich bekommt die
UI einen sichtbaren „letzter Sample vor X s"-Indikator, damit sich im
Feldtest empirisch verifizieren lässt, ob der Fix ausreicht.

**Architektur-Risiko / Phase-2-Fallback:**
Auch mit WakeLock kann Chromium im WebView `setTimeout`/`setInterval`
im Hintergrund drosseln. Wenn nach Phase 1 Samples weiterhin einfrieren,
folgt Phase 2 (aus Scope dieses Plans): Polling in einen WebWorker auslagern
(weniger aggressive Drosselung) oder native Polling-Implementierung im
Foreground-Service. Details am Ende des Plans.

**Tech Stack:** Kotlin/Java (Android), Capacitor 8, TypeScript, Vitest,
React, MUI.

**Kontext für Agent:**

- Root: `/Users/paul/Documents/Feuerwehr/hydranten-map`
- Parent-Branch: `feat/radiacode-via-bluetooth`
- Arbeite in Worktree `.worktrees/radiacode-background-recording`, basiert
  auf `feat/radiacode-via-bluetooth`.
- Vor Start: `cp .env.local .worktrees/radiacode-background-recording/`.
- Vor jedem Commit: `git checkout -- next-env.d.ts` (siehe [CLAUDE.md](../../CLAUDE.md)).
- Vor Merge: `npm run check` muss grün sein. TS-Fehler dürfen **nie**
  ignoriert werden.
- Commit-Messages: Conventional Commits (`feat(radiacode): …`,
  `fix(radiacode): …`).
- Android-Build zur Verifikation:
  `cd capacitor && npm run build:debug` → APK liegt in
  `capacitor/android/app/build/outputs/apk/debug/`.
- Manuelle Tests MÜSSEN auf einem echten Android-Gerät laufen (nicht Emulator),
  weil Doze/App-Standby im Emulator anders sind.
- Relevante Dateien:
  - `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.java`
  - `capacitor/android/app/src/main/AndroidManifest.xml` (`WAKE_LOCK`
    Permission ist bereits deklariert — nicht doppelt hinzufügen!)
  - `src/components/providers/RadiacodeProvider.tsx` (UI-Indikator)
  - `src/hooks/radiacode/types.ts` (Typ für `lastSampleTimestamp`, falls
    noch nicht vorhanden)

---

### Task 1: Worktree anlegen und Setup

**Files:**

- Create worktree: `.worktrees/radiacode-background-recording`

**Step 1: Worktree erstellen**

Run aus dem Repository-Root (`/Users/paul/Documents/Feuerwehr/hydranten-map`):

```bash
git worktree add .worktrees/radiacode-background-recording -b feat/radiacode-background-recording feat/radiacode-via-bluetooth
```

Expected: `Preparing worktree … HEAD is now at 3babd2a …`

**Step 2: `.env.local` in den Worktree kopieren**

```bash
cp .env.local .worktrees/radiacode-background-recording/
```

Expected: kein Output, Datei existiert im Worktree.

**Step 3: In den Worktree wechseln und npm-Deps sicherstellen**

```bash
cd .worktrees/radiacode-background-recording
npm install
```

Expected: Install läuft durch (`up to date` oder wenige neue Pakete).

**Step 4: Sanity-Check `npm run check` auf Parent-Branch**

```bash
NO_COLOR=1 npm run check
```

Expected: **PASS** (tsc, lint, tests, build alle grün). Falls rot, vor
Weiterarbeit mit dem User klären — wir wollen keine Vorbelastung importieren.

**Step 5: Kein Commit in diesem Task** — reine Worktree-Einrichtung.

---

### Task 2: Failing-Test — `RadiacodeProvider` setzt `lastSampleTimestamp`

**Ziel:** Wir brauchen einen beobachtbaren Indikator „letzter Sample vor X s",
damit im Feldtest sichtbar ist, ob der WakeLock wirkt. TDD: erst Test, dann
Feld im Provider ergänzen, dann UI.

**Files:**

- Modify: `src/components/providers/RadiacodeProvider.test.tsx`

**Step 1: Prüfe, ob der Context bereits ein `lastSampleTimestamp` ausliefert**

```bash
grep -n "lastSampleTimestamp" src/components/providers/RadiacodeProvider.tsx src/components/providers/RadiacodeProvider.test.tsx
```

Erwartung: Feld existiert NICHT.

**Step 2: Neuen Test ergänzen**

Ergänze in `src/components/providers/RadiacodeProvider.test.tsx` einen
neuen `describe`-Block direkt NACH dem bestehenden Block, der
`updateForegroundService` testet (Zeile ~389):

```tsx
  describe('lastSampleTimestamp', () => {
    it('ist null, solange keine messung eingetroffen ist', async () => {
      const { result } = renderHookWithProvider();
      expect(result.current.lastSampleTimestamp).toBeNull();
    });

    it('wird auf Date.now() gesetzt, sobald eine messung eintrifft', async () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(new Date(now));
      const { result, emitMeasurement } = renderHookWithProvider();
      await act(async () => {
        await emitMeasurement({ cps: 12, dosisleistung: 0.15, timestamp: now });
      });
      await waitFor(() => {
        expect(result.current.lastSampleTimestamp).toBe(now);
      });
    });
  });
```

**Hinweis:** Welche Helper (`renderHookWithProvider`, `emitMeasurement`,
`act`, `waitFor`) in der Datei vorhanden sind, siehe Datei-Anfang. Nutze
exakt dieselben Namen wie die bestehenden Tests.

**Step 3: Test ausführen, FAIL erwarten**

```bash
NO_COLOR=1 npx vitest run src/components/providers/RadiacodeProvider.test.tsx
```

Expected: **FAIL** mit `Property 'lastSampleTimestamp' does not exist on type 'RadiacodeContextValue'` und/oder `expected null to be 1700000000000`.

**Step 4: Commit nur Test**

```bash
git add src/components/providers/RadiacodeProvider.test.tsx
git commit -m "test(radiacode): lastSampleTimestamp im provider expected"
```

---

### Task 3: Feld `lastSampleTimestamp` im `RadiacodeProvider` implementieren

**Files:**

- Modify: `src/components/providers/RadiacodeProvider.tsx`

**Step 1: Context-Typ erweitern**

Suche in `src/components/providers/RadiacodeProvider.tsx` nach dem
`RadiacodeContextValue`-Interface und füge ein Feld hinzu:

```ts
export interface RadiacodeContextValue {
  // … bestehend …
  lastSampleTimestamp: number | null;
}
```

**Step 2: State einführen**

Direkt dort, wo `measurement` als State gesetzt wird (oder — eleganter —
als `useMemo` aus `measurement.timestamp`), einen State einführen:

```ts
const lastSampleTimestamp = measurement?.timestamp ?? null;
```

`measurement.timestamp` wird bereits von `extractLatestMeasurement` in
`client.ts` als `Date.now()` gesetzt (siehe [client.ts:444](../../src/hooks/radiacode/client.ts#L444)),
d.h. der Wert ist verlässlich.

**Step 3: Feld in den Context-Value aufnehmen**

Ergänze `lastSampleTimestamp` in dem Objekt, das an `Provider.value`
übergeben wird. Achte darauf, dass die `useMemo`-Abhängigkeiten es
enthalten.

**Step 4: Test grün**

```bash
NO_COLOR=1 npx vitest run src/components/providers/RadiacodeProvider.test.tsx
```

Expected: **PASS**.

**Step 5: Commit**

```bash
git add src/components/providers/RadiacodeProvider.tsx
git commit -m "feat(radiacode): lastSampleTimestamp im context ausliefern"
```

---

### Task 4: Failing-Test — UI-Indikator „letzter Sample vor X s"

**Ziel:** In `RadiacodeLiveWidget` einen sichtbaren Indikator, der das Alter
des letzten Samples zeigt. Der Indikator wird sichtbar auffällig (rot/warning),
wenn der letzte Sample > 5 Sekunden alt ist.

**Files:**

- Create: `src/components/Map/RadiacodeLiveWidget.test.tsx` (falls noch
  nicht existent — zuerst prüfen).

**Step 1: Existenz prüfen**

```bash
ls src/components/Map/RadiacodeLiveWidget.test.tsx 2>/dev/null || echo MISSING
```

Falls MISSING, siehe Step 2. Falls vorhanden, den neuen Test dort anhängen.

**Step 2: Test-File anlegen (bzw. Test ergänzen)**

Test soll zwei Fälle abdecken:

1. `lastSampleTimestamp` ist aktuell (<5s) → Indikator zeigt `"jetzt"`
   oder fehlt komplett.
2. `lastSampleTimestamp` ist älter als 5s → Indikator zeigt
   `"Letzte Messung vor Xs"` in einer `warning`-Farbe.

Test-Gerüst:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RadiacodeLiveWidget } from './RadiacodeLiveWidget';
import { RadiacodeContext } from '../providers/RadiacodeProvider';

function renderWithContext(overrides: Partial<RadiacodeContextValue>) {
  const base: RadiacodeContextValue = {
    status: 'connected',
    device: { id: 'x', name: 'Radiacode', serial: 'x' },
    deviceInfo: null,
    measurement: { cps: 10, dosisleistung: 0.1, timestamp: Date.now() },
    history: [],
    error: null,
    lastSampleTimestamp: Date.now(),
    // … restliche Defaults aus dem bestehenden Provider kopieren …
  } as RadiacodeContextValue;
  return render(
    <RadiacodeContext.Provider value={{ ...base, ...overrides }}>
      <RadiacodeLiveWidget />
    </RadiacodeContext.Provider>,
  );
}

describe('RadiacodeLiveWidget sample-age indicator', () => {
  it('zeigt keinen Warnhinweis, wenn der letzte Sample <5s her ist', () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(new Date(now));
    renderWithContext({ lastSampleTimestamp: now - 2_000 });
    expect(screen.queryByText(/letzte messung vor/i)).toBeNull();
  });

  it('zeigt warnung, wenn der letzte Sample ≥5s her ist', () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(new Date(now));
    renderWithContext({ lastSampleTimestamp: now - 7_000 });
    expect(screen.getByText(/letzte messung vor 7\s*s/i)).toBeInTheDocument();
  });
});
```

**Step 3: Test ausführen, FAIL erwarten**

```bash
NO_COLOR=1 npx vitest run src/components/Map/RadiacodeLiveWidget.test.tsx
```

Expected: **FAIL** (Widget enthält noch keinen Age-Indikator).

**Step 4: Commit nur Test**

```bash
git add src/components/Map/RadiacodeLiveWidget.test.tsx
git commit -m "test(radiacode): warnhinweis bei altem sample (TDD)"
```

---

### Task 5: Age-Indikator in `RadiacodeLiveWidget` implementieren

**Files:**

- Modify: `src/components/Map/RadiacodeLiveWidget.tsx`

**Step 1: Komponente öffnen und Aufbau verstehen**

```bash
sed -n '1,80p' src/components/Map/RadiacodeLiveWidget.tsx
```

**Step 2: Hook einbauen, der alle Sekunde re-rendert (nötig, sonst altert
die Anzeige nicht „live")**

Direkt im Widget (oder als kleiner `useNow()`-Hook in derselben Datei):

```tsx
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

**Step 3: Indikator rendern**

Innerhalb des Widgets:

```tsx
const now = useNow();
const { lastSampleTimestamp } = useRadiacode();
const ageSec =
  lastSampleTimestamp != null ? Math.round((now - lastSampleTimestamp) / 1000) : null;
const isStale = ageSec != null && ageSec >= 5;
```

Dann im JSX (nur wenn `isStale`):

```tsx
{isStale && (
  <Typography variant="caption" color="warning.main">
    Letzte Messung vor {ageSec}s
  </Typography>
)}
```

**Step 4: Test grün**

```bash
NO_COLOR=1 npx vitest run src/components/Map/RadiacodeLiveWidget.test.tsx
```

Expected: **PASS**.

**Step 5: Voller Check**

```bash
git checkout -- next-env.d.ts
NO_COLOR=1 npm run check
```

Expected: alles grün.

**Step 6: Commit**

```bash
git add src/components/Map/RadiacodeLiveWidget.tsx
git commit -m "feat(radiacode): warn-indikator wenn letzter sample >5s alt"
```

---

### Task 6: `PARTIAL_WAKE_LOCK` im Foreground Service akquirieren

**Ziel:** Kern-Änderung dieses Plans. Der Service hält einen WakeLock, solange
er aktiv ist. Kein TS-Test möglich (Java-Code, kein instrumentation-Setup
im Projekt) — verifiziert wird in Task 7 manuell auf Gerät.

**Files:**

- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.java`

**Step 1: Import ergänzen**

Ganz oben in der Datei, nach den bestehenden `android.os.*`-Imports:

```java
import android.os.PowerManager;
```

**Step 2: WakeLock-Feld und Konstante**

Unterhalb von `NOTIFICATION_ID`:

```java
    public static final String WAKE_LOCK_TAG = "einsatzkarte:radiacode";

    private PowerManager.WakeLock wakeLock;
```

**Step 3: WakeLock akquirieren bei `ACTION_START`**

Im `onStartCommand`, im `ACTION_START`-Zweig, **direkt nach
`startForeground(...)`**:

```java
            acquireWakeLock();
```

Und eine Helper-Methode in der Klasse ergänzen:

```java
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
        wakeLock.setReferenceCounted(false);
        // Kein Timeout -> wakeLock wird explizit in ACTION_STOP / onDestroy freigegeben.
        // Android warnt zwar bei acquire() ohne Timeout, aber wir managen das Lifecycle
        // deterministisch über Service-Start/Stop.
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }
```

**Step 4: WakeLock freigeben bei `ACTION_STOP`**

Im `ACTION_STOP`-Zweig, **vor `stopForeground(...)`**:

```java
            releaseWakeLock();
```

**Step 5: Sicherheitsnetz in `onDestroy`**

Klassen-`onDestroy()` anlegen (falls nicht vorhanden):

```java
    @Override
    public void onDestroy() {
        releaseWakeLock();
        super.onDestroy();
    }
```

**Step 6: Kompilieren**

```bash
cd capacitor
npm run sync
cd android
./gradlew assembleDebug --no-daemon
```

Expected: BUILD SUCCESSFUL. Bei Fehler: **nicht** `--no-verify` oder
ähnliches, sondern Fehler lesen und fixen. Typische Stolpersteine:
vergessener Import `android.content.Context`, Tippfehler im Tag.

**Step 7: Commit**

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/radiacode-background-recording
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.java
git commit -m "feat(radiacode): PARTIAL_WAKE_LOCK im foreground service"
```

---

### Task 7: Manuelle Verifikation auf Android-Gerät

**Ziel:** Empirisch belegen, dass das Recording bei gesperrtem Bildschirm
weiterläuft. Dieser Task hat bewusst kein Unit-Test-Gegenstück.

**Voraussetzung:** Ein physisches Android-Gerät (nicht Emulator) mit
USB-Debugging, ein gekoppeltes Radiacode und eine zweite Person oder
Stopwatch.

**Step 1: Debug-APK bauen und installieren**

```bash
cd .worktrees/radiacode-background-recording/capacitor
npm run build:debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Expected: `Success`.

**Step 2: Logcat-Filter vorbereiten (in neuem Terminal)**

```bash
adb logcat -c
adb logcat | grep -iE "radiacode|wakelock|BluetoothGatt"
```

**Step 3: Test-Szenario ausführen**

1. App öffnen, Radiacode verbinden, Tracking starten.
2. Beobachten: `RadiacodeLiveWidget` zeigt aktuelle Werte, KEIN
   „Letzte Messung vor …"-Warnhinweis.
3. Bildschirm manuell sperren (Power-Knopf).
4. 2 Minuten warten.
5. Bildschirm entsperren, App in den Vordergrund holen.
6. Prüfen: Ist der Warnhinweis „Letzte Messung vor Xs" sichtbar?
   - Wert < 5s → ✅ WakeLock hat gehalten, Samples kamen durch.
   - Wert 5–10s → ⚠️ Leichte Drosselung, akzeptabel, aber notieren.
   - Wert > 30s → ❌ JS im WebView wurde gedrosselt trotz WakeLock.
     → Phase-2-Fallback (siehe unten) einleiten.

**Step 4: Firestore-Seitig verifizieren**

Öffne im Browser den Einsatz und prüfe die Track-Punkte (Layer-View).
Zwischen Lock und Unlock sollten Punkte im 500 ms / User-konfigurierten
Raster eingetroffen sein.

**Step 5: Ergebnis dokumentieren**

Erstelle `docs/plans/2026-04-21-radiacode-background-recording-results.md`
mit:

```markdown
# Feldtest-Ergebnis — WakeLock Phase 1

**Datum:** <Datum>
**Gerät:** <z.B. Pixel 7, Android 14>
**Radiacode:** <Modell>
**Dauer Lock-Phase:** 2 min
**Warnhinweis beim Entsperren:** <Wert in s>
**Anzahl Track-Punkte während Lock-Phase:** <n>
**Logcat-Auszug relevante Zeilen:** <kurzer Copy>

**Fazit:**
- [ ] Phase 1 ausreichend → Plan abschließen, PR öffnen.
- [ ] Phase 2 nötig → Issue öffnen mit Tag `radiacode-background`.
```

**Step 6: Nur bei Erfolg committen**

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/radiacode-background-recording
git add docs/plans/2026-04-21-radiacode-background-recording-results.md
git commit -m "docs(radiacode): feldtest-ergebnis wakelock phase 1"
```

---

### Task 8: Doku aktualisieren — Protokoll-Doc um Background-Verhalten

**Files:**

- Modify: `docs/radiacode-bluetooth-protocol.md`

**Step 1: Abschnitt „Android — Hintergrundbetrieb" am Ende ergänzen**

```markdown
## Android — Hintergrundbetrieb

Die Capacitor-App startet einen Foreground Service
(`RadiacodeForegroundService`) mit `foregroundServiceType="connectedDevice|location"`,
sobald eine Radiacode-Session läuft. Der Service akquiriert einen
`PARTIAL_WAKE_LOCK` (Tag `einsatzkarte:radiacode`), damit der CPU-Takt bei
gesperrtem Bildschirm nicht gedrosselt wird und die BLE-GATT-Callbacks
weiterlaufen.

**Grenzen:** Auch mit WakeLock drosselt Chromium im WebView unter Umständen
`setTimeout`/`setInterval` im Hintergrund. Falls Track-Samples bei
längerer Lock-Phase einfrieren (empirisch über den „Letzte Messung vor …"-
Hinweis im `RadiacodeLiveWidget` erkennbar), ist die nächste Stufe entweder
ein WebWorker für den Polling-Loop oder eine native Polling-Implementierung
im Service.

**Diagnose im Feld:**
`adb logcat | grep -iE "radiacode|wakelock|BluetoothGatt"` zeigt, ob
GATT-Events weiter ankommen und der WakeLock gehalten wird.
```

**Step 2: Commit**

```bash
git add docs/radiacode-bluetooth-protocol.md
git commit -m "docs(radiacode): android foreground-service und wakelock dokumentiert"
```

---

### Task 9: `npm run check` grün + Merge in Parent-Branch

**Step 1: Voller Check**

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/radiacode-background-recording
git checkout -- next-env.d.ts
NO_COLOR=1 npm run check
```

Expected: **PASS** (tsc, lint, tests, build).

**Step 2: Push**

```bash
git push -u origin feat/radiacode-background-recording
```

**Step 3: Merge in `feat/radiacode-via-bluetooth`**

Zurück zum Haupt-Worktree:

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map
git checkout feat/radiacode-via-bluetooth
git merge --no-ff feat/radiacode-background-recording -m "feat(radiacode): hintergrundaufzeichnung via wakelock"
git push
```

**Step 4: Worktree aufräumen**

```bash
git worktree remove .worktrees/radiacode-background-recording
git branch -d feat/radiacode-background-recording
```

---

## Phase 2 — Falls WakeLock nicht reicht (out of scope)

Wenn Task 7 zeigt, dass der WebView trotz WakeLock Samples verliert:

### Option A: Polling in WebWorker

`RadiacodeClient.startPolling` wird in einen Dedicated Worker verschoben.
WebWorker-Timer sind von Chromiums Background-Throttling deutlich weniger
betroffen. Der Worker kommuniziert via `postMessage` mit dem Main-Thread.
**Problem:** Der Worker hat keinen Zugriff auf Capacitor-Plugins — BLE
muss also weiterhin im Main-Thread laufen, und nur das Sample-Processing
wandert in den Worker. Begrenzter Nutzen.

### Option B: Native Polling im Foreground Service (Recommended, falls Option A nicht reicht)

Radiacode-Protokoll (protocol.ts) in Kotlin portieren, `BluetoothGatt`
direkt im Foreground Service betreiben, Messwerte per Plugin-Event
(`RadiacodeNotification.addListener('measurement', …)`) an den WebView
senden. Samples werden dabei in einem In-Memory-Ringpuffer im Service
gehalten und bei Wiedererscheinen der App en-bloc an den WebView
geschickt.

**Aufwand:** Groß — Protokoll-Decoder in Kotlin neu implementieren,
inkl. Tests. Dafür maximal robust.

### Option C: Background Runner (NICHT empfohlen)

`@capawesome/capacitor-background-runner` läuft in einem eigenen
JS-Kontext, der KEINEN Zugriff auf `@capacitor-community/bluetooth-le`
hat. Daher für unseren Fall nicht sinnvoll — das eigentliche Problem
(BLE im Background) wird nicht gelöst.

---

## Definition of Done

- [ ] `PARTIAL_WAKE_LOCK` wird beim Service-Start akquiriert und beim Stop
      freigegeben.
- [ ] `RadiacodeProvider` liefert `lastSampleTimestamp`.
- [ ] `RadiacodeLiveWidget` zeigt sichtbaren Warnhinweis bei Samples >5s
      Alter.
- [ ] `npm run check` grün.
- [ ] Feldtest auf physischem Android-Gerät dokumentiert
      (`docs/plans/2026-04-21-radiacode-background-recording-results.md`).
- [ ] Doku-Abschnitt in `docs/radiacode-bluetooth-protocol.md` ergänzt.
- [ ] Branch gemerged in `feat/radiacode-via-bluetooth`, Worktree entfernt.
