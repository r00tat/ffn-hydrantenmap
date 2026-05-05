# Permission-Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.
>
> **Project convention (lean plans):** No per-task commits, no per-task checks. Implement all blocks in one go. Run `npx tsc --noEmit` → `npx eslint` → `npx vitest run` → `npx next build --webpack` ONCE at the end. Then commit per thematic block (Block 5).

**Goal:** Beim ersten Start der Android-App durchläuft der User einen Wizard mit drei Permission-Steps (Standort, Bluetooth, Notifications). Bei späterem Feature-Aufruf mit fehlender Permission: Re-Request oder Settings-Deeplink-Dialog.

**Architecture:** Drei Schichten — natives Mini-Plugin `AppPermissions` (Kotlin), TS-Util `src/lib/permissions/` mit `ensureXxx()`-Helpern, React-UI mit `PermissionOnboardingProvider` + `SettingsRedirectDialogProvider` im Root-Layout. Web/PWA bleibt unangetastet (alle `ensureXxx()` returnen `true`).

**Tech Stack:** Next.js 16 / React 19 / MUI / Capacitor 8 / Kotlin (Android), Vitest + @testing-library/react für Tests.

**Reference:** [docs/plans/2026-05-02-permission-onboarding-design.md](./2026-05-02-permission-onboarding-design.md) hat das volle Design.

---

## Block 1 — Natives Plugin

### Task 1.1: `AppPermissionsPlugin.kt`

**File (create):** [capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/AppPermissionsPlugin.kt](capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/AppPermissionsPlugin.kt)

```kotlin
package at.ffnd.einsatzkarte

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "AppPermissions",
    permissions = [
        Permission(
            alias = "location",
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ]
        ),
        Permission(
            alias = "notifications",
            strings = ["android.permission.POST_NOTIFICATIONS"]
        ),
        Permission(
            alias = "bluetooth",
            strings = [
                "android.permission.BLUETOOTH_SCAN",
                "android.permission.BLUETOOTH_CONNECT",
            ]
        ),
    ]
)
class AppPermissionsPlugin : Plugin() {

    private val prefsName = "app_permissions"

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        val state = computeState(type)
        call.resolve(JSObject().put("state", state))
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        val perms = permsForType(type)
        if (perms.isEmpty()) {
            // Permission existiert auf dieser API nicht (z.B. POST_NOTIFICATIONS < 33)
            call.resolve(JSObject().put("state", "granted"))
            return
        }
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit()
        perms.forEach { prefs.putBoolean("hasRequested:$it", true) }
        prefs.apply()

        // Capacitor's Alias-basiertes Request-Flow
        requestPermissionForAlias(type, call, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        call.resolve(JSObject().put("state", computeState(type)))
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        call.resolve()
    }

    private fun permsForType(type: String): List<String> = when (type) {
        "location" -> listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        "notifications" -> if (Build.VERSION.SDK_INT >= 33)
            listOf("android.permission.POST_NOTIFICATIONS")
        else emptyList()
        "bluetooth" -> if (Build.VERSION.SDK_INT >= 31) listOf(
            "android.permission.BLUETOOTH_SCAN",
            "android.permission.BLUETOOTH_CONNECT",
        ) else emptyList()
        else -> emptyList()
    }

    private fun computeState(type: String): String {
        val perms = permsForType(type)
        if (perms.isEmpty()) return "granted"  // OS too old → no runtime permission needed

        val granted = perms.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
        if (granted) return "granted"

        val sharedPrefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val askedBefore = perms.any { sharedPrefs.getBoolean("hasRequested:$it", false) }
        if (!askedBefore) return "prompt"

        val act = activity ?: return "denied"
        val rationale = perms.any {
            ActivityCompat.shouldShowRequestPermissionRationale(act, it)
        }
        return if (rationale) "denied" else "permanentlyDenied"
    }
}
```

### Task 1.2: Plugin in `MainActivity` registrieren

**File (modify):** [capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java:64](capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java#L64)

Direkt unter der bestehenden Zeile `registerPlugin(RadiacodeNotificationPlugin.class);` ergänzen:

```java
registerPlugin(AppPermissionsPlugin.class);
```

---

## Block 2 — TypeScript-Schicht

### Task 2.1: `@capacitor/preferences` zur Haupt-`package.json` hinzufügen

**File (modify):** [package.json](package.json) — im `dependencies`-Block ergänzen:

```json
"@capacitor/preferences": "^8.0.1",
```

Danach `npm install` ausführen.

### Task 2.2: Plugin-Proxy + Types

**File (create):** `src/lib/permissions/AppPermissions.ts`

```ts
import { registerPlugin } from '@capacitor/core';

export type PermissionType = 'location' | 'notifications' | 'bluetooth';

export type PermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'permanentlyDenied';

export interface AppPermissionsPlugin {
  checkPermission(opts: { type: PermissionType }): Promise<{ state: PermissionState }>;
  requestPermission(opts: { type: PermissionType }): Promise<{ state: PermissionState }>;
  openAppSettings(): Promise<void>;
}

export const AppPermissions =
  registerPlugin<AppPermissionsPlugin>('AppPermissions');
```

### Task 2.3: Settings-Dialog Event-Bus

**File (create):** `src/lib/permissions/settingsDialog.ts`

```ts
import { PermissionType } from './AppPermissions';

export interface SettingsDialogRequest {
  type: PermissionType;
  message: string;
}

type Listener = (req: SettingsDialogRequest) => void;
const listeners = new Set<Listener>();

export function subscribeSettingsDialog(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function triggerSettingsDialog(req: SettingsDialogRequest): void {
  listeners.forEach((fn) => fn(req));
}
```

### Task 2.4: `ensureXxx()`-Helper

**File (create):** `src/lib/permissions/index.ts`

```ts
import { Capacitor } from '@capacitor/core';
import { AppPermissions, PermissionType } from './AppPermissions';
import { triggerSettingsDialog } from './settingsDialog';

export type { PermissionType, PermissionState } from './AppPermissions';
export { AppPermissions } from './AppPermissions';
export { subscribeSettingsDialog } from './settingsDialog';

const MESSAGES: Record<PermissionType, string> = {
  location:
    'Der Standortzugriff wurde dauerhaft abgelehnt. Bitte aktiviere ihn in den App-Einstellungen, um deinen Standort auf der Karte anzuzeigen.',
  bluetooth:
    'Der Bluetooth-Zugriff wurde dauerhaft abgelehnt. Bitte aktiviere ihn in den App-Einstellungen, um Radiacode-Geräte verbinden zu können.',
  notifications:
    'Der Mitteilungs-Zugriff wurde dauerhaft abgelehnt. Bitte aktiviere ihn in den App-Einstellungen, damit die Radiacode-Aufzeichnung im Hintergrund laufen kann.',
};

async function ensure(type: PermissionType): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  const checked = await AppPermissions.checkPermission({ type });
  if (checked.state === 'granted') return true;
  if (checked.state === 'permanentlyDenied') {
    triggerSettingsDialog({ type, message: MESSAGES[type] });
    return false;
  }

  const requested = await AppPermissions.requestPermission({ type });
  if (requested.state === 'granted') return true;
  if (requested.state === 'permanentlyDenied') {
    triggerSettingsDialog({ type, message: MESSAGES[type] });
    return false;
  }
  return false;
}

export const ensureLocation = (): Promise<boolean> => ensure('location');
export const ensureBluetooth = (): Promise<boolean> => ensure('bluetooth');
export const ensureNotifications = (): Promise<boolean> => ensure('notifications');

export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await AppPermissions.openAppSettings();
}
```

### Task 2.5: Tests

**File (create):** `src/lib/permissions/index.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
  registerPlugin: vi.fn(() => ({
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    openAppSettings: vi.fn(),
  })),
}));

import { Capacitor } from '@capacitor/core';
import { AppPermissions } from './AppPermissions';
import {
  ensureBluetooth,
  ensureLocation,
  ensureNotifications,
} from './index';
import { subscribeSettingsDialog } from './settingsDialog';

const isNative = Capacitor.isNativePlatform as unknown as ReturnType<typeof vi.fn>;
const check = AppPermissions.checkPermission as unknown as ReturnType<typeof vi.fn>;
const request = AppPermissions.requestPermission as unknown as ReturnType<typeof vi.fn>;

describe('ensureLocation/Bluetooth/Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true on web without calling plugin', async () => {
    isNative.mockReturnValue(false);
    expect(await ensureLocation()).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it('returns true when already granted', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'granted' });
    expect(await ensureBluetooth()).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('opens settings dialog when permanently denied (check)', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'permanentlyDenied' });
    const listener = vi.fn();
    subscribeSettingsDialog(listener);
    expect(await ensureNotifications()).toBe(false);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notifications' })
    );
  });

  it('requests when prompt, returns true on grant', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'prompt' });
    request.mockResolvedValue({ state: 'granted' });
    expect(await ensureLocation()).toBe(true);
    expect(request).toHaveBeenCalledWith({ type: 'location' });
  });

  it('opens settings dialog when permanently denied after request', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'denied' });
    request.mockResolvedValue({ state: 'permanentlyDenied' });
    const listener = vi.fn();
    subscribeSettingsDialog(listener);
    expect(await ensureBluetooth()).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('returns false on plain denied', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'denied' });
    request.mockResolvedValue({ state: 'denied' });
    const listener = vi.fn();
    subscribeSettingsDialog(listener);
    expect(await ensureLocation()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
```

---

## Block 3 — React-UI

### Task 3.1: `SettingsRedirectDialog` + Provider

**File (create):** `src/components/permissions/SettingsRedirectDialog.tsx`

```tsx
'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import React from 'react';
import { openAppSettings, PermissionType } from '../../lib/permissions';

const TITLES: Record<PermissionType, string> = {
  location: 'Standort blockiert',
  bluetooth: 'Bluetooth blockiert',
  notifications: 'Mitteilungen blockiert',
};

interface Props {
  open: boolean;
  type: PermissionType | null;
  message: string;
  onClose: () => void;
}

export default function SettingsRedirectDialog({
  open,
  type,
  message,
  onClose,
}: Props) {
  const title = type ? TITLES[type] : 'Berechtigung blockiert';
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="contained"
          onClick={async () => {
            await openAppSettings();
            onClose();
          }}
        >
          Einstellungen öffnen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

**File (create):** `src/components/permissions/SettingsRedirectDialogProvider.tsx`

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import {
  PermissionType,
  subscribeSettingsDialog,
} from '../../lib/permissions';
import SettingsRedirectDialog from './SettingsRedirectDialog';

interface State {
  open: boolean;
  type: PermissionType | null;
  message: string;
}

export default function SettingsRedirectDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State>({
    open: false,
    type: null,
    message: '',
  });

  useEffect(() => {
    return subscribeSettingsDialog(({ type, message }) => {
      setState({ open: true, type, message });
    });
  }, []);

  return (
    <>
      {children}
      <SettingsRedirectDialog
        open={state.open}
        type={state.type}
        message={state.message}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </>
  );
}
```

### Task 3.2: `PermissionStep` + Test

**File (create):** `src/components/permissions/PermissionStep.tsx`

```tsx
'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import {
  AppPermissions,
  PermissionType,
} from '../../lib/permissions';

export type StepResult = 'granted' | 'denied' | 'skipped';

interface Props {
  type: PermissionType;
  icon: React.ReactNode;
  title: string;
  description: string;
  onResult: (result: StepResult) => void;
}

export default function PermissionStep({
  type,
  icon,
  title,
  description,
  onResult,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleAllow = async () => {
    setBusy(true);
    try {
      const { state } = await AppPermissions.requestPermission({ type });
      onResult(state === 'granted' ? 'granted' : 'denied');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={3} alignItems="center" sx={{ p: 3, textAlign: 'center' }}>
      <Box sx={{ fontSize: 96, color: 'primary.main' }}>{icon}</Box>
      <Typography variant="h5">{title}</Typography>
      <Typography>{description}</Typography>
      <Stack direction="row" spacing={2}>
        <Button
          variant="text"
          onClick={() => onResult('skipped')}
          disabled={busy}
        >
          Später
        </Button>
        <Button variant="contained" onClick={handleAllow} disabled={busy}>
          Erlauben
        </Button>
      </Stack>
    </Stack>
  );
}
```

**File (create):** `src/components/permissions/PermissionStep.test.tsx`

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/permissions', () => ({
  AppPermissions: {
    requestPermission: vi.fn(),
  },
}));

import { AppPermissions } from '../../lib/permissions';
import PermissionStep from './PermissionStep';

describe('PermissionStep', () => {
  it('calls onResult("skipped") when "Später" clicked', () => {
    const onResult = vi.fn();
    render(
      <PermissionStep
        type="location"
        icon={null}
        title="Standort"
        description="d"
        onResult={onResult}
      />
    );
    fireEvent.click(screen.getByText('Später'));
    expect(onResult).toHaveBeenCalledWith('skipped');
  });

  it('calls request and resolves with granted/denied', async () => {
    const onResult = vi.fn();
    (AppPermissions.requestPermission as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ state: 'granted' });
    render(
      <PermissionStep
        type="bluetooth"
        icon={null}
        title="BT"
        description="d"
        onResult={onResult}
      />
    );
    fireEvent.click(screen.getByText('Erlauben'));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith('granted'));
  });
});
```

### Task 3.3: `PermissionOnboardingWizard` + Test

**File (create):** `src/components/permissions/PermissionOnboardingWizard.tsx`

```tsx
'use client';

import BluetoothIcon from '@mui/icons-material/Bluetooth';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import MobileStepper from '@mui/material/MobileStepper';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { PermissionType } from '../../lib/permissions';
import PermissionStep, { StepResult } from './PermissionStep';

interface StepDef {
  type: PermissionType;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEPS: StepDef[] = [
  {
    type: 'location',
    icon: <LocationOnIcon fontSize="inherit" />,
    title: 'Standort',
    description:
      'Damit dein Standort auf der Einsatzkarte angezeigt wird und GPS-Tracks aufgezeichnet werden können, benötigt die App Zugriff auf deinen Standort.',
  },
  {
    type: 'bluetooth',
    icon: <BluetoothIcon fontSize="inherit" />,
    title: 'Bluetooth',
    description:
      'Für die Verbindung zu Radiacode-Strahlungsmessgeräten benötigt die App Zugriff auf Bluetooth. Wenn du keine Radiacode-Geräte verwendest, kannst du diesen Schritt überspringen.',
  },
  {
    type: 'notifications',
    icon: <NotificationsIcon fontSize="inherit" />,
    title: 'Mitteilungen',
    description:
      'Während die Radiacode-Aufzeichnung im Hintergrund läuft, zeigt die App eine Benachrichtigung an. Dafür benötigt sie die Erlaubnis, Mitteilungen anzuzeigen. Wenn du keine Radiacode-Geräte verwendest, kannst du diesen Schritt überspringen.',
  },
];

interface Props {
  onComplete: () => void;
}

export default function PermissionOnboardingWizard({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleResult = (_: StepResult) => {
    if (currentStep + 1 >= STEPS.length) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const step = STEPS[currentStep];

  return (
    <Dialog open fullScreen>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
          Berechtigungen einrichten
        </Typography>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PermissionStep
            type={step.type}
            icon={step.icon}
            title={step.title}
            description={step.description}
            onResult={handleResult}
          />
        </div>
        <MobileStepper
          variant="dots"
          steps={STEPS.length}
          position="static"
          activeStep={currentStep}
          backButton={null}
          nextButton={null}
          sx={{ justifyContent: 'center' }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

**File (create):** `src/components/permissions/PermissionOnboardingWizard.test.tsx`

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/permissions', () => ({
  AppPermissions: { requestPermission: vi.fn() },
}));

import PermissionOnboardingWizard from './PermissionOnboardingWizard';

describe('PermissionOnboardingWizard', () => {
  it('progresses through steps and calls onComplete after the last', () => {
    const onComplete = vi.fn();
    render(<PermissionOnboardingWizard onComplete={onComplete} />);
    expect(screen.getByText('Standort')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Später'));
    expect(screen.getByText('Bluetooth')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Später'));
    expect(screen.getByText('Mitteilungen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Später'));
    expect(onComplete).toHaveBeenCalled();
  });
});
```

### Task 3.4: `PermissionOnboardingProvider` + Test

**File (create):** `src/components/permissions/PermissionOnboardingProvider.tsx`

```tsx
'use client';

import { Capacitor } from '@capacitor/core';
import React, { useEffect, useState } from 'react';
import PermissionOnboardingWizard from './PermissionOnboardingWizard';

const PREF_KEY = 'permissionOnboardingCompleted';

type WizardState = 'loading' | 'show' | 'hidden';

export default function PermissionOnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<WizardState>('loading');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setState('hidden');
      return;
    }
    let cancelled = false;
    (async () => {
      const { Preferences } = await import('@capacitor/preferences');
      const v = await Preferences.get({ key: PREF_KEY });
      if (cancelled) return;
      setState(v.value === '1' ? 'hidden' : 'show');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleComplete = async () => {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREF_KEY, value: '1' });
    setState('hidden');
  };

  if (state === 'loading') return null;
  if (state === 'show') {
    return <PermissionOnboardingWizard onComplete={handleComplete} />;
  }
  return <>{children}</>;
}
```

**File (create):** `src/components/permissions/PermissionOnboardingProvider.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));
vi.mock('./PermissionOnboardingWizard', () => ({
  default: () => <div>WIZARD</div>,
}));

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import PermissionOnboardingProvider from './PermissionOnboardingProvider';

const isNative = Capacitor.isNativePlatform as unknown as ReturnType<typeof vi.fn>;
const prefsGet = Preferences.get as unknown as ReturnType<typeof vi.fn>;

describe('PermissionOnboardingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('on web: renders children, no wizard', async () => {
    isNative.mockReturnValue(false);
    render(
      <PermissionOnboardingProvider>
        <div>APP</div>
      </PermissionOnboardingProvider>
    );
    await waitFor(() => expect(screen.getByText('APP')).toBeInTheDocument());
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('native + flag set: renders children', async () => {
    isNative.mockReturnValue(true);
    prefsGet.mockResolvedValue({ value: '1' });
    render(
      <PermissionOnboardingProvider>
        <div>APP</div>
      </PermissionOnboardingProvider>
    );
    await waitFor(() => expect(screen.getByText('APP')).toBeInTheDocument());
  });

  it('native + flag not set: renders wizard', async () => {
    isNative.mockReturnValue(true);
    prefsGet.mockResolvedValue({ value: null });
    render(
      <PermissionOnboardingProvider>
        <div>APP</div>
      </PermissionOnboardingProvider>
    );
    await waitFor(() => expect(screen.getByText('WIZARD')).toBeInTheDocument());
  });
});
```

### Task 3.5: Wizard im Root-Provider mounten

**File (modify):** [src/components/providers/AppProviders.tsx](src/components/providers/AppProviders.tsx)

In den Imports ergänzen:

```tsx
const PermissionOnboardingProvider = dynamic(
  () => import('../permissions/PermissionOnboardingProvider'),
  { ssr: false }
);
const SettingsRedirectDialogProvider = dynamic(
  () => import('../permissions/SettingsRedirectDialogProvider'),
  { ssr: false }
);
```

In der `AppProviders`-Funktion: `<SnackbarProvider>` umschliesst Provider — der Wizard sitzt **innerhalb** von `SnackbarProvider`, **um** den `<div>` mit `<AuthorizationApp>`. Damit erscheint er vor dem Login. `SettingsRedirectDialogProvider` ebenfalls hier:

```tsx
<SnackbarProvider>
  <ServiceWorkerUpdateListener />
  <DebugLoggingProvider>
    <div className={`${styles.container} print-content-root`}>
      <CssBaseline enableColorScheme />
      <SingedOutOneTapLogin />
      <SettingsRedirectDialogProvider>
        <PermissionOnboardingProvider>
          <AuthorizationApp>{children}</AuthorizationApp>
        </PermissionOnboardingProvider>
      </SettingsRedirectDialogProvider>
    </div>
  </DebugLoggingProvider>
</SnackbarProvider>
```

---

## Block 4 — Integration in bestehende Aufruf-Sites

### Task 4.1: `usePosition.ts` — `ensureLocation()` vor Watch

**File (modify):** [src/hooks/usePosition.ts:31-42](src/hooks/usePosition.ts#L31-L42)

`startWatching` zu `async` machen, am Anfang `ensureLocation()` aufrufen. Vollständige neue Version der Funktion:

```ts
const startWatching = useCallback(async () => {
  if (watchIdRef.current !== undefined) return;
  if (!(await ensureLocation())) {
    setIsPending(false);
    return;
  }
  if (!navigator.geolocation) {
    setIsPending(false);
    showSnackbar(
      'Standortbestimmung wird von diesem Browser nicht unterstützt.',
      'error'
    );
    return;
  }
  // ... bestehender watchPosition-Block bleibt unverändert
}, [showSnackbar]);
```

Import oben ergänzen:

```ts
import { ensureLocation } from '../lib/permissions';
```

### Task 4.2: `bleAdapter.capacitor.ts` — `ensureBluetooth()` + `ensureNotifications()`

**File (modify):** [src/hooks/radiacode/bleAdapter.capacitor.ts](src/hooks/radiacode/bleAdapter.capacitor.ts)

Import oben:

```ts
import { ensureBluetooth, ensureNotifications } from '../../lib/permissions';
```

In `requestDevice` (ca. Zeile 46) **vor** `client.requestDevice(...)`:

```ts
async requestDevice() {
  if (!(await ensureBluetooth())) {
    throw new Error('Bluetooth-Berechtigung erforderlich');
  }
  const client = await ensureBleClient();
  // ...
}
```

In `connect` (ca. Zeile 91) **innerhalb** des `if (isNativeAvailable())`-Blocks, **vor** `nativeConnect`:

```ts
if (isNativeAvailable()) {
  if (!(await ensureNotifications())) {
    throw new Error(
      'Mitteilungen erforderlich für Radiacode-Hintergrundaufzeichnung'
    );
  }
  await nativeConnect(deviceId);
  // ...
}
```

### Task 4.3: `messaging.ts` — über `ensureNotifications()` routen

**File (modify):** [src/components/firebase/messaging.ts:4-21](src/components/firebase/messaging.ts#L4-L21)

Vollständige neue `requestPermission`:

```ts
import { Capacitor } from '@capacitor/core';
import { ensureNotifications } from '../../lib/permissions';

export async function requestPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return ensureNotifications();
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  console.log('Requesting notification permission...');
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}
```

**File (modify):** [src/components/firebase/messaging.test.ts](src/components/firebase/messaging.test.ts)

Zwei zusätzliche Mocks oben ergänzen (`vi.mock('@capacitor/core', …)` und `vi.mock('../../lib/permissions', …)`), Test-Cases für native/web-Pfad. Falls die bestehenden Tests durch die neuen Mocks brechen, anpassen oder ergänzen.

### Task 4.4: Cleanup im `RadiacodeNotificationPlugin`

**File (modify):** [capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java](capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java)

Der `@Permission`-Block (Zeilen 24-28) und der Permission-Request-Block in `connectNative` (Zeilen 72-77) sowie die `permissionCallback`-Methode (Zeilen 249-252) entfernen. Notifications werden jetzt JS-seitig in `bleAdapter.capacitor.ts` über `ensureNotifications()` geklärt, **bevor** `connectNative` aufgerufen wird.

Vollständig vor:

```java
@CapacitorPlugin(
        name = "RadiacodeNotification",
        permissions = {
                @Permission(
                        alias = "notifications",
                        strings = { "android.permission.POST_NOTIFICATIONS" })
        })
public class RadiacodeNotificationPlugin extends Plugin {
```

Nach:

```java
@CapacitorPlugin(name = "RadiacodeNotification")
public class RadiacodeNotificationPlugin extends Plugin {
```

In `connectNative` den ganzen Block:

```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    if (getPermissionState("notifications") != PermissionState.GRANTED) {
        Log.i(TAG, "plugin.connectNative requesting POST_NOTIFICATIONS permission");
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }
}
```

löschen. Ebenso die `permissionCallback`-Methode am Ende. Unbenutzte Imports (`com.getcapacitor.PermissionState`, `com.getcapacitor.annotation.Permission`, `com.getcapacitor.annotation.PermissionCallback`) entfernen.

---

## Block 5 — Final Checks & Commit

### Task 5.1: `npm install`

```bash
npm install
```

Erwartet: `@capacitor/preferences` wird hinzugefügt, `package-lock.json` aktualisiert.

### Task 5.2: Capacitor sync (registriert das neue native Plugin)

```bash
cd capacitor && npm run sync
```

Erwartet: Das neue `AppPermissions`-Plugin wird in `capacitor.plugins.json` der App-Assets übernommen.

### Task 5.3: Checks in Reihenfolge

```bash
npx tsc --noEmit
npx eslint
NO_COLOR=1 npx vitest run
npx next build --webpack
```

Jeden Schritt grün bekommen, **bevor** der nächste läuft. Bei Fehlern fixen.

### Task 5.4: Manueller Smoke-Test (Android-Gerät)

Auf einem Android 13+ Test-Gerät:

1. App-Daten löschen / frisch installieren.
2. App starten → Wizard erscheint vor dem Login.
3. Step 1 „Standort" → „Erlauben" → System-Dialog akzeptieren.
4. Step 2 „Bluetooth" → „Später".
5. Step 3 „Mitteilungen" → „Erlauben" → akzeptieren.
6. Login → Karte öffnen → Standort-Marker erscheint.
7. Radiacode verbinden tippen → Bluetooth-System-Dialog erscheint (weil im Onboarding „Später").
8. Bluetooth System-Dialog mehrfach ablehnen mit „Don't ask again" → erneut Connect tippen → `SettingsRedirectDialog` erscheint → „Einstellungen öffnen" → System-Settings-Page der App öffnet sich.

### Task 5.5: Commits

Vier thematische Commits (oder ein gebündelter, falls bevorzugt):

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/AppPermissionsPlugin.kt \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java
git commit -m "feat(android): add AppPermissions native plugin for unified permission handling"

git add package.json package-lock.json src/lib/permissions/
git commit -m "feat: permission helpers (ensureLocation/Bluetooth/Notifications) and settings dialog event bus"

git add src/components/permissions/ src/components/providers/AppProviders.tsx
git commit -m "feat: permission onboarding wizard UI"

git add src/hooks/usePosition.ts \
        src/hooks/radiacode/bleAdapter.capacitor.ts \
        src/components/firebase/messaging.ts \
        src/components/firebase/messaging.test.ts \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java
git commit -m "refactor: route permission requests through ensure helpers"
```

`next-env.d.ts` vor jedem Commit zurücksetzen, falls geändert:

```bash
git checkout -- next-env.d.ts
```

### Task 5.6: PR

Mit `gh pr create` (vorher `unset GITHUB_TOKEN`). Titel: `feat(android): permission onboarding wizard`. Beschreibung auf Deutsch nach Projekt-Konvention (siehe CLAUDE.md). Test-Plan-Punkte aus Task 5.4 übernehmen.

---

## Open Questions / Risks

- **Capacitor `getPermissionState` vs unser `computeState`:** Capacitors integriertes `getPermissionState(alias)` liefert `'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'`. Wir nutzen es nicht, weil es keine zuverlässige Unterscheidung „prompt" (nie gefragt) vs „permanently denied" liefert. Stattdessen eigene Logik via `SharedPreferences` + `shouldShowRequestPermissionRationale`. Falls die eigene Logik in der Praxis Edge-Cases produziert: Fallback auf Capacitors API + akzeptieren, dass „permanently denied" und „nie gefragt" gleich behandelt werden (Settings-Dialog erscheint dann auch beim allerersten Tap).
- **`requestPermissionForAlias` mit `type` als String-Param:** Im Plugin nehme ich an, dass `requestPermissionForAlias(type, call, …)` den Alias-Namen direkt akzeptiert, weil unsere Aliase identisch zu den `type`-Werten sind (`"location"`, `"notifications"`, `"bluetooth"`). Bei Capacitor 8 ist das so; falls die Signatur abweicht, mit `requestPermissionForAliases(arrayOf(type), ...)` anpassen.
