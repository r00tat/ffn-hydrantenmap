# Chrome Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome Extension (Manifest V3) that provides popup access to Einsatz overview and Einsatztagebuch, plus a Sybos content script, using Firebase SDK directly.

**Architecture:** Extension lives in `chrome-extension/` within the monorepo. Vite + CRXJS bundles the extension. React 19 + MUI 7 for UI. Firebase JS SDK for auth and Firestore access — same stack as the main app. Content script communicates with background service worker via `chrome.runtime.sendMessage()`.

**Tech Stack:** TypeScript, React 19, MUI 7, Firebase 12, Vite, CRXJS, Chrome Manifest V3

**Reference:** Design doc at `docs/plans/2026-04-14-chrome-extension-design.md`

---

## Task 1: Project Scaffolding

Set up the Chrome Extension project structure with Vite, CRXJS, and all configuration files.

**Files:**
- Create: `chrome-extension/package.json`
- Create: `chrome-extension/tsconfig.json`
- Create: `chrome-extension/vite.config.ts`
- Create: `chrome-extension/manifest.json`
- Create: `chrome-extension/src/popup/index.html`
- Create: `chrome-extension/src/popup/index.tsx`
- Create: `chrome-extension/src/popup/App.tsx`
- Create: `chrome-extension/src/background/service-worker.ts`
- Create: `chrome-extension/public/icons/` (placeholder icons)

**Step 1: Create `chrome-extension/package.json`**

```json
{
  "name": "einsatzkarte-extension",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "@mui/material": "^7.0.2",
    "@mui/icons-material": "^7.3.9",
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.1",
    "firebase": "12.11.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.32",
    "@types/chrome": "^0.0.304",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.3",
    "@vitejs/plugin-react": "^4.4.1",
    "typescript": "^5.8.3",
    "vite": "^6.3.3"
  }
}
```

**Step 2: Create `chrome-extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create `chrome-extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Einsatzkarte",
  "description": "Einsatzkarte der FF Neusiedl am See — Einsatzübersicht und Tagebuch",
  "version": "0.1.0",
  "permissions": [
    "identity",
    "storage"
  ],
  "host_permissions": [
    "https://*.firebaseio.com/*",
    "https://*.googleapis.com/*",
    "https://*.firebaseapp.com/*"
  ],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://sybos.lfv-bgld.at/*"],
      "js": ["src/content/sybos.ts"],
      "css": []
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "oauth2": {
    "client_id": "429163084278-q0ft241066jqadh3tv9cv0djcs1e7534.apps.googleusercontent.com",
    "scopes": [
      "openid",
      "email",
      "profile"
    ]
  },
  "key": ""
}
```

Note: The `key` field will need to be populated with the extension's public key after first Chrome Web Store upload, or generated locally for consistent extension ID during development. The `oauth2.client_id` must also be registered in the Google Cloud Console for the extension's origin.

**Step 4: Create `chrome-extension/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
    },
  },
});
```

**Step 5: Create `chrome-extension/src/popup/index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Einsatzkarte</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./index.tsx"></script>
</body>
</html>
```

**Step 6: Create `chrome-extension/src/popup/index.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 7: Create `chrome-extension/src/popup/App.tsx`**

Minimal shell — just renders "Einsatzkarte" text to verify the build works.

```tsx
import { CssBaseline, ThemeProvider, createTheme, Typography, Box } from '@mui/material';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#d32f2f' },
  },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ width: 400, minHeight: 500, p: 2 }}>
        <Typography variant="h6">Einsatzkarte</Typography>
        <Typography variant="body2" color="text.secondary">
          Extension wird geladen...
        </Typography>
      </Box>
    </ThemeProvider>
  );
}
```

**Step 8: Create `chrome-extension/src/background/service-worker.ts`**

Minimal service worker placeholder.

```typescript
chrome.runtime.onInstalled.addListener(() => {
  console.log('Einsatzkarte Extension installed');
});
```

**Step 9: Create placeholder icons**

Generate simple placeholder PNG icons (16x16, 48x48, 128x128) in `chrome-extension/public/icons/`. Can be simple red squares or use the Feuerwehr logo later.

**Step 10: Install dependencies and verify build**

```bash
cd chrome-extension
npm install
npm run build
```

Expected: Build succeeds, `dist/` directory contains the built extension.

**Step 11: Load extension in Chrome and verify popup**

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `chrome-extension/dist/`
4. Click extension icon → popup shows "Einsatzkarte" text

**Step 12: Commit**

```bash
git add chrome-extension/
git commit -m "feat(chrome-extension): scaffold project with Vite + CRXJS"
```

---

## Task 2: Firebase Initialization (Shared Module)

Initialize Firebase in the extension, reusing the same config as the main app.

**Files:**
- Create: `chrome-extension/src/shared/firebase.ts`
- Create: `chrome-extension/src/shared/config.ts`

**Step 1: Create `chrome-extension/src/shared/config.ts`**

The Firebase config for the extension. Hardcoded since Chrome Extensions can't use `process.env`. This is public config (API keys for Firebase web apps are designed to be public — security comes from Firestore rules and Auth).

```typescript
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD1VlCe-OzX8Yt44AK7as0PU-71G9hFkN4',
  authDomain: 'ffn-utils.firebaseapp.com',
  projectId: 'ffn-utils',
  storageBucket: 'ffn-utils.appspot.com',
  messagingSenderId: '429163084278',
  appId: '1:429163084278:web:...',  // fill from .env.local
  measurementId: 'G-0JVBEYMY02',
};

// Use 'ffndev' for dev, empty string for prod
export const FIRESTORE_DB = 'ffndev';

export const EINSATZKARTE_URL = 'https://einsatzkarte.ff-neusiedlamsee.at';
```

Note: Read the actual `appId` value from `.env.local` (`NEXT_PUBLIC_FIREBASE_APIKEY` JSON). The `FIRESTORE_DB` should eventually be configurable (dev/prod toggle in extension settings).

**Step 2: Create `chrome-extension/src/shared/firebase.ts`**

```typescript
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { FIREBASE_CONFIG, FIRESTORE_DB } from './config';

const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);

export const auth: Auth = getAuth(app);
export const firestore: Firestore = FIRESTORE_DB
  ? getFirestore(app, FIRESTORE_DB)
  : getFirestore(app);
export { app as firebaseApp };
```

**Step 3: Verify import works**

Update `chrome-extension/src/popup/App.tsx` to import firebase and log the app name:

```tsx
import { firebaseApp } from '@shared/firebase';
console.log('Firebase app:', firebaseApp.name);
```

**Step 4: Build and test**

```bash
cd chrome-extension && npm run build
```

Reload extension in Chrome, open popup, check console for "Firebase app: [DEFAULT]".

**Step 5: Commit**

```bash
git add chrome-extension/src/shared/
git commit -m "feat(chrome-extension): add Firebase initialization"
```

---

## Task 3: Authentication with Google OAuth

Implement login via `chrome.identity` API + Firebase Auth.

**Files:**
- Create: `chrome-extension/src/shared/auth.ts`
- Create: `chrome-extension/src/popup/components/Login.tsx`
- Modify: `chrome-extension/src/popup/App.tsx`

**Step 1: Create `chrome-extension/src/shared/auth.ts`**

```typescript
import {
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * Sign in using chrome.identity to get a Google OAuth token,
 * then exchange it for a Firebase credential.
 */
export async function signInWithGoogle(): Promise<User> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'));
        return;
      }
      try {
        const credential = GoogleAuthProvider.credential(null, token);
        const result = await signInWithCredential(auth, credential);
        resolve(result.user);
      } catch (err) {
        // If token is stale, remove and retry once
        chrome.identity.removeCachedAuthToken({ token }, () => {
          reject(err);
        });
      }
    });
  });
}

export async function signOut(): Promise<void> {
  // Revoke Chrome identity token
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          firebaseSignOut(auth).then(resolve);
        });
      } else {
        firebaseSignOut(auth).then(resolve);
      }
    });
  });
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
```

**Step 2: Create `chrome-extension/src/popup/components/Login.tsx`**

```tsx
import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { signInWithGoogle } from '@shared/auth';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 2,
        p: 3,
      }}
    >
      <Typography variant="h5" gutterBottom>
        Einsatzkarte
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Melde dich an, um auf Einsatzdaten und das Tagebuch zuzugreifen.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      )}
      <Button
        variant="contained"
        onClick={handleLogin}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={20} /> : null}
        sx={{ mt: 2 }}
      >
        {loading ? 'Anmelden...' : 'Mit Google anmelden'}
      </Button>
    </Box>
  );
}
```

**Step 3: Update `chrome-extension/src/popup/App.tsx` with auth state**

```tsx
import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  Box,
  CircularProgress,
} from '@mui/material';
import { onAuthChange } from '@shared/auth';
import Login from './components/Login';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#d32f2f' },
  },
});

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ width: 400, minHeight: 500 }}>
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 500,
            }}
          >
            <CircularProgress />
          </Box>
        ) : user ? (
          <Box sx={{ p: 2 }}>
            Eingeloggt als {user.email}
            {/* Main app content comes in next tasks */}
          </Box>
        ) : (
          <Login />
        )}
      </Box>
    </ThemeProvider>
  );
}
```

**Step 4: Register extension in Google Cloud Console**

For `chrome.identity.getAuthToken` to work:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. The OAuth 2.0 client `429163084278-...` must have the extension's origin added
3. Alternatively, create a new Chrome App OAuth client for the extension's ID

This is a manual step — document it in the README.

**Step 5: Build, reload, test login flow**

```bash
cd chrome-extension && npm run build
```

Reload in Chrome. Click extension → should see Login screen → click "Mit Google anmelden" → OAuth flow → shows email.

**Step 6: Commit**

```bash
git add chrome-extension/src/shared/auth.ts chrome-extension/src/popup/
git commit -m "feat(chrome-extension): add Google OAuth login via chrome.identity"
```

---

## Task 4: Firestore Types (Shared from Main App)

Set up shared type imports so the extension reuses the main app's Firestore type definitions.

**Files:**
- Create: `chrome-extension/src/shared/types.ts`
- Modify: `chrome-extension/tsconfig.json` (add path alias)

**Step 1: Create `chrome-extension/src/shared/types.ts`**

Re-export the types the extension needs from the main app. This avoids duplicating type definitions.

```typescript
// Re-export Firestore types from main app
// These are pure type definitions with no runtime dependencies on Next.js
export type {
  Firecall,
  FirecallItem,
  Diary,
} from '../../src/components/firebase/firestore';

// Re-export collection constants
export {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../../src/components/firebase/firestore';
```

**Step 2: Verify the imports work**

Check whether `src/components/firebase/firestore.ts` has any Next.js or browser-specific imports that would break in the extension context. If it does, extract the pure types into a shared file at `src/common/firestore-types.ts` instead.

Run:
```bash
cd chrome-extension && npx tsc --noEmit
```

If the import from `../../src/components/firebase/firestore` fails due to transitive dependencies (Leaflet types, Next.js types), then:
- Create `src/common/firestore-types.ts` in the main app with just the type definitions
- Both the main app and extension import from there

**Step 3: Commit**

```bash
git add chrome-extension/src/shared/types.ts
git commit -m "feat(chrome-extension): add shared Firestore type imports"
```

---

## Task 5: Firecall Selection

Fetch active firecalls from Firestore and let the user select one.

**Files:**
- Create: `chrome-extension/src/popup/components/FirecallSelect.tsx`
- Create: `chrome-extension/src/popup/hooks/useFirecalls.ts`
- Modify: `chrome-extension/src/popup/App.tsx`

**Step 1: Create `chrome-extension/src/popup/hooks/useFirecalls.ts`**

```typescript
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import { Firecall, FIRECALL_COLLECTION_ID } from '@shared/types';

/**
 * Subscribe to active (non-deleted) firecalls, sorted by date descending.
 */
export function useFirecalls() {
  const [firecalls, setFirecalls] = useState<Firecall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(firestore, FIRECALL_COLLECTION_ID),
      where('deleted', '!=', true),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const calls = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as Firecall[];
      setFirecalls(calls);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { firecalls, loading };
}
```

Note: The Firestore query may need adjustment based on how the `deleted` field works (it might be absent rather than `false`). Check the existing `useFirebaseCollection` pattern in `src/hooks/useFirebaseCollection.ts` and `filterActiveItems` in `src/components/firebase/firestore.ts` for the exact filter logic. The extension should replicate the same filter.

**Step 2: Create `chrome-extension/src/popup/components/FirecallSelect.tsx`**

```tsx
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
} from '@mui/material';
import { Firecall } from '@shared/types';

interface FirecallSelectProps {
  firecalls: Firecall[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

export default function FirecallSelect({
  firecalls,
  selectedId,
  onSelect,
  loading,
}: FirecallSelectProps) {
  if (loading) {
    return <Skeleton variant="rectangular" height={56} />;
  }

  return (
    <FormControl fullWidth size="small">
      <InputLabel>Einsatz</InputLabel>
      <Select
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value)}
        label="Einsatz"
      >
        {firecalls.map((fc) => (
          <MenuItem key={fc.id} value={fc.id}>
            {fc.name} — {fc.date ? new Date(fc.date).toLocaleDateString('de-AT') : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
```

**Step 3: Wire into App.tsx**

Update `App.tsx` to show `FirecallSelect` in the header. Store selected firecall ID in state, default to first (most recent) firecall.

```tsx
// Add to App.tsx when user is logged in:
const { firecalls, loading: firecallsLoading } = useFirecalls();
const [selectedFirecallId, setSelectedFirecallId] = useState<string | null>(null);

// Auto-select most recent firecall
useEffect(() => {
  if (firecalls.length > 0 && !selectedFirecallId) {
    setSelectedFirecallId(firecalls[0].id!);
  }
}, [firecalls, selectedFirecallId]);
```

**Step 4: Persist selected firecall ID**

Use `chrome.storage.local` to remember the last selected firecall:

```typescript
// Save selection
chrome.storage.local.set({ selectedFirecallId: id });

// Load on startup
chrome.storage.local.get('selectedFirecallId', (result) => {
  if (result.selectedFirecallId) {
    setSelectedFirecallId(result.selectedFirecallId);
  }
});
```

**Step 5: Build and test**

```bash
cd chrome-extension && npm run build
```

Reload extension → login → should see dropdown with firecalls.

**Step 6: Commit**

```bash
git add chrome-extension/src/popup/hooks/ chrome-extension/src/popup/components/FirecallSelect.tsx chrome-extension/src/popup/App.tsx
git commit -m "feat(chrome-extension): add firecall selection with persistence"
```

---

## Task 6: Firecall Overview Tab

Show basic info about the selected firecall.

**Files:**
- Create: `chrome-extension/src/popup/components/FirecallOverview.tsx`
- Create: `chrome-extension/src/popup/hooks/useFirecallItems.ts`
- Modify: `chrome-extension/src/popup/App.tsx` (add tabs)

**Step 1: Create `chrome-extension/src/popup/hooks/useFirecallItems.ts`**

Hook to fetch items for the selected firecall (vehicles, personnel counts).

```typescript
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
} from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import {
  FirecallItem,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '@shared/types';

export function useFirecallItems(firecallId: string | null) {
  const [items, setItems] = useState<FirecallItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firecallId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allItems = snapshot.docs
        .map((doc) => ({ ...doc.data(), id: doc.id } as FirecallItem))
        .filter((item) => !item.deleted);
      setItems(allItems);
      setLoading(false);
    });

    return unsubscribe;
  }, [firecallId]);

  return { items, loading };
}
```

**Step 2: Create `chrome-extension/src/popup/components/FirecallOverview.tsx`**

```tsx
import { Box, Typography, Chip, Skeleton, Divider } from '@mui/material';
import {
  LocalFireDepartment,
  DirectionsCar,
  AccessTime,
} from '@mui/icons-material';
import { Firecall, FirecallItem } from '@shared/types';

interface FirecallOverviewProps {
  firecall: Firecall | undefined;
  items: FirecallItem[];
  loading: boolean;
}

export default function FirecallOverview({
  firecall,
  items,
  loading,
}: FirecallOverviewProps) {
  if (loading || !firecall) {
    return <Skeleton variant="rectangular" height={200} />;
  }

  const vehicleCount = items.filter((i) => i.type === 'vehicle').length;
  const isActive = firecall.eintreffen && !firecall.abruecken;

  return (
    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocalFireDepartment color="error" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          {firecall.name}
        </Typography>
        <Chip
          label={isActive ? 'Aktiv' : 'Beendet'}
          color={isActive ? 'error' : 'default'}
          size="small"
        />
      </Box>

      {firecall.description && (
        <Typography variant="body2" color="text.secondary">
          {firecall.description}
        </Typography>
      )}

      <Divider />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AccessTime fontSize="small" color="action" />
          <Typography variant="body2">
            {firecall.date
              ? new Date(firecall.date).toLocaleString('de-AT')
              : '–'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <DirectionsCar fontSize="small" color="action" />
          <Typography variant="body2">
            {vehicleCount} Fahrzeug{vehicleCount !== 1 ? 'e' : ''}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
```

**Step 3: Add tab navigation to App.tsx**

Add MUI Tabs with "Übersicht" and "Tagebuch" tabs below the firecall selector.

```tsx
import { Tabs, Tab } from '@mui/material';

// In the logged-in section:
const [tab, setTab] = useState(0);

<Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
  <Tab label="Übersicht" />
  <Tab label="Tagebuch" />
</Tabs>

{tab === 0 && (
  <FirecallOverview
    firecall={selectedFirecall}
    items={items}
    loading={itemsLoading}
  />
)}
{tab === 1 && (
  <Box>Tagebuch kommt in Task 7</Box>
)}
```

**Step 4: Build and test**

Reload extension → select firecall → Übersicht tab shows firecall details with vehicle count.

**Step 5: Commit**

```bash
git add chrome-extension/src/popup/
git commit -m "feat(chrome-extension): add firecall overview with item counts"
```

---

## Task 7: Diary List

Show Einsatztagebuch entries for the selected firecall.

**Files:**
- Create: `chrome-extension/src/popup/hooks/useDiaries.ts`
- Create: `chrome-extension/src/popup/components/DiaryList.tsx`
- Modify: `chrome-extension/src/popup/App.tsx` (wire Tagebuch tab)

**Step 1: Create `chrome-extension/src/popup/hooks/useDiaries.ts`**

Simplified version of the main app's `useDiaries` — only shows manual diary entries (not auto-generated vehicle events, which require complex processing).

```typescript
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import {
  Diary,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '@shared/types';

export function useDiaries(firecallId: string | null) {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firecallId) {
      setDiaries([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID
      ),
      where('type', '==', 'diary'),
      orderBy('datum', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs
        .map((doc) => ({ ...doc.data(), id: doc.id } as Diary))
        .filter((d) => !d.deleted);
      // Assign sequential numbers by chronological order
      const sorted = [...entries].sort((a, b) =>
        (a.datum || '').localeCompare(b.datum || '')
      );
      sorted.forEach((entry, idx) => {
        entry.nummer = idx + 1;
      });
      setDiaries(entries); // Keep desc order for display
      setLoading(false);
    });

    return unsubscribe;
  }, [firecallId]);

  return { diaries, loading };
}
```

Note: The main app uses a compound query that may require a Firestore index. Check `firebase/prod/firestore.indexes.json` — if no index exists for `type` + `datum` on the `item` subcollection, create one. Alternatively, fetch all items and filter client-side like the main app does.

**Step 2: Create `chrome-extension/src/popup/components/DiaryList.tsx`**

```tsx
import {
  Box,
  List,
  ListItem,
  ListItemText,
  Typography,
  Chip,
  Skeleton,
} from '@mui/material';
import { Diary } from '@shared/types';

const ART_LABELS: Record<string, { label: string; color: 'info' | 'warning' | 'success' }> = {
  M: { label: 'Meldung', color: 'info' },
  B: { label: 'Befehl', color: 'warning' },
  F: { label: 'Frage', color: 'success' },
};

interface DiaryListProps {
  diaries: Diary[];
  loading: boolean;
}

export default function DiaryList({ diaries, loading }: DiaryListProps) {
  if (loading) {
    return (
      <Box sx={{ p: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={60} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (diaries.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Keine Tagebucheinträge vorhanden.
        </Typography>
      </Box>
    );
  }

  return (
    <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
      {diaries.map((entry) => {
        const artInfo = entry.art ? ART_LABELS[entry.art] : undefined;
        const timestamp = entry.datum
          ? new Date(entry.datum).toLocaleString('de-AT', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit',
            })
          : '';

        return (
          <ListItem key={entry.id} divider>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" fontWeight="bold" sx={{ mr: 0.5 }}>
                    #{entry.nummer}
                  </Typography>
                  {artInfo && (
                    <Chip
                      label={artInfo.label}
                      color={artInfo.color}
                      size="small"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {entry.name}
                  </Typography>
                </Box>
              }
              secondary={
                <Typography variant="caption" color="text.secondary">
                  {timestamp}
                  {entry.von && ` — Von: ${entry.von}`}
                  {entry.an && ` → An: ${entry.an}`}
                </Typography>
              }
            />
          </ListItem>
        );
      })}
    </List>
  );
}
```

**Step 3: Wire into App.tsx Tagebuch tab**

```tsx
{tab === 1 && (
  <DiaryList diaries={diaries} loading={diariesLoading} />
)}
```

**Step 4: Build and test**

Reload extension → select firecall → Tagebuch tab → should show diary entries.

**Step 5: Commit**

```bash
git add chrome-extension/src/popup/
git commit -m "feat(chrome-extension): add diary list with real-time Firestore updates"
```

---

## Task 8: New Diary Entry Form

Add the form for creating new Einsatztagebuch entries.

**Files:**
- Create: `chrome-extension/src/popup/components/DiaryForm.tsx`
- Modify: `chrome-extension/src/popup/App.tsx` (add FAB + form toggle)

**Step 1: Create `chrome-extension/src/popup/components/DiaryForm.tsx`**

```tsx
import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { addDoc, collection } from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import { auth } from '@shared/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '@shared/types';

interface DiaryFormProps {
  firecallId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function DiaryForm({
  firecallId,
  onClose,
  onSaved,
}: DiaryFormProps) {
  const [art, setArt] = useState<'M' | 'B' | 'F'>('M');
  const [name, setName] = useState('');
  const [von, setVon] = useState('');
  const [an, setAn] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      await addDoc(
        collection(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_ITEMS_COLLECTION_ID
        ),
        {
          type: 'diary',
          art,
          name: name.trim(),
          von: von.trim() || undefined,
          an: an.trim() || undefined,
          beschreibung: beschreibung.trim() || undefined,
          datum: now,
          editable: true,
          created: now,
          creator: auth.currentUser?.email || '',
          zIndex: Date.now(),
        }
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Eintrag konnte nicht gespeichert werden'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ToggleButtonGroup
          value={art}
          exclusive
          onChange={(_, v) => v && setArt(v)}
          size="small"
        >
          <ToggleButton value="M">Meldung</ToggleButton>
          <ToggleButton value="B">Befehl</ToggleButton>
          <ToggleButton value="F">Frage</ToggleButton>
        </ToggleButtonGroup>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </Box>

      <TextField
        label="Nachricht"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        multiline
        rows={2}
        size="small"
        fullWidth
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="Von"
          value={von}
          onChange={(e) => setVon(e.target.value)}
          size="small"
          fullWidth
        />
        <TextField
          label="An"
          value={an}
          onChange={(e) => setAn(e.target.value)}
          size="small"
          fullWidth
        />
      </Box>

      <TextField
        label="Beschreibung"
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
        size="small"
        fullWidth
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={saving || !name.trim()}
        startIcon={saving ? <CircularProgress size={20} /> : null}
      >
        {saving ? 'Speichern...' : 'Eintrag erstellen'}
      </Button>
    </Box>
  );
}
```

**Step 2: Add FAB and form toggle to App.tsx**

In the Tagebuch tab, add a Floating Action Button that toggles the DiaryForm:

```tsx
import { Fab } from '@mui/material';
import { Add } from '@mui/icons-material';

const [showForm, setShowForm] = useState(false);

// In Tagebuch tab:
{tab === 1 && (
  <Box sx={{ position: 'relative' }}>
    {showForm ? (
      <DiaryForm
        firecallId={selectedFirecallId!}
        onClose={() => setShowForm(false)}
        onSaved={() => setShowForm(false)}
      />
    ) : (
      <>
        <DiaryList diaries={diaries} loading={diariesLoading} />
        <Fab
          color="primary"
          size="small"
          onClick={() => setShowForm(true)}
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
        >
          <Add />
        </Fab>
      </>
    )}
  </Box>
)}
```

**Step 3: Build and test**

Reload extension → Tagebuch tab → FAB → fill form → "Eintrag erstellen" → entry appears in list. Verify entry also appears in the main Einsatzkarte app.

**Step 4: Commit**

```bash
git add chrome-extension/src/popup/
git commit -m "feat(chrome-extension): add diary entry creation form"
```

---

## Task 9: Background Service Worker

Set up the service worker to handle Firebase operations for the content script and manage auth state.

**Files:**
- Modify: `chrome-extension/src/background/service-worker.ts`

**Step 1: Implement message handler in service-worker.ts**

```typescript
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, FIRESTORE_DB } from '../shared/config';

// Initialize Firebase in service worker context
const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const firestore = FIRESTORE_DB
  ? getFirestore(app, FIRESTORE_DB)
  : getFirestore(app);

// Track current user
let currentUser: User | null = null;
onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

// Message types for content script communication
type MessageRequest =
  | { type: 'GET_AUTH_STATE' }
  | { type: 'GET_CURRENT_FIRECALL' }
  | { type: 'GET_FIRECALL'; firecallId: string };

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; // Keep channel open for async response
  }
);

async function handleMessage(message: MessageRequest) {
  switch (message.type) {
    case 'GET_AUTH_STATE':
      return {
        isLoggedIn: !!currentUser,
        email: currentUser?.email || null,
      };

    case 'GET_CURRENT_FIRECALL': {
      if (!currentUser) return { error: 'Not authenticated' };
      const { selectedFirecallId } = await chrome.storage.local.get(
        'selectedFirecallId'
      );
      if (!selectedFirecallId) return { firecall: null };
      return getFirecallData(selectedFirecallId);
    }

    case 'GET_FIRECALL': {
      if (!currentUser) return { error: 'Not authenticated' };
      return getFirecallData(message.firecallId);
    }

    default:
      return { error: 'Unknown message type' };
  }
}

async function getFirecallData(firecallId: string) {
  const docSnap = await getDoc(doc(firestore, 'call', firecallId));
  if (!docSnap.exists()) return { firecall: null };
  return { firecall: { ...docSnap.data(), id: docSnap.id } };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Einsatzkarte Extension installed');
});
```

**Step 2: Build and verify**

```bash
cd chrome-extension && npm run build
```

Reload extension. Check `chrome://extensions/` → "Inspect views: service worker" → console should show install message.

**Step 3: Commit**

```bash
git add chrome-extension/src/background/
git commit -m "feat(chrome-extension): add service worker with Firebase message handler"
```

---

## Task 10: Sybos Content Script

Minimal content script that shows the current firecall on sybos.lfv-bgld.at.

**Files:**
- Create: `chrome-extension/src/content/sybos.ts`
- Create: `chrome-extension/src/content/sybos.css`

**Step 1: Create `chrome-extension/src/content/sybos.css`**

```css
#einsatzkarte-widget {
  position: fixed;
  top: 80px;
  right: 0;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
}

#einsatzkarte-widget .ek-toggle {
  position: absolute;
  right: 0;
  top: 0;
  background: #d32f2f;
  color: white;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px 0 0 4px;
  font-size: 12px;
  font-weight: bold;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

#einsatzkarte-widget .ek-panel {
  position: absolute;
  right: 0;
  top: 0;
  width: 280px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px 0 0 8px;
  box-shadow: -2px 2px 8px rgba(0,0,0,0.15);
  padding: 12px;
  display: none;
}

#einsatzkarte-widget .ek-panel.open {
  display: block;
}

#einsatzkarte-widget .ek-title {
  font-weight: bold;
  color: #d32f2f;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#einsatzkarte-widget .ek-field {
  margin-bottom: 4px;
  color: #333;
}

#einsatzkarte-widget .ek-field label {
  color: #666;
  font-size: 11px;
  display: block;
}

#einsatzkarte-widget .ek-link {
  display: inline-block;
  margin-top: 8px;
  color: #d32f2f;
  text-decoration: none;
  font-weight: 500;
}

#einsatzkarte-widget .ek-link:hover {
  text-decoration: underline;
}

#einsatzkarte-widget .ek-status {
  color: #666;
  font-style: italic;
  text-align: center;
  padding: 16px 0;
}
```

**Step 2: Create `chrome-extension/src/content/sybos.ts`**

Uses safe DOM methods (createElement/textContent) instead of innerHTML to prevent XSS.

```typescript
import './sybos.css';

const EINSATZKARTE_URL = 'https://einsatzkarte.ff-neusiedlamsee.at';

// Helper to create DOM elements safely
function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  text?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    });
  }
  if (text) {
    el.textContent = text;
  }
  return el;
}

// Build widget DOM
const widget = createElement('div', { id: 'einsatzkarte-widget' });
const toggle = createElement('button', { className: 'ek-toggle' }, 'EK');
const panel = createElement('div', { className: 'ek-panel' });

// Panel header
const titleRow = createElement('div', { className: 'ek-title' });
const titleText = createElement('span', {}, 'Einsatzkarte');
const closeBtn = createElement('button', {
  style: 'background:none;border:none;cursor:pointer;font-size:16px;',
}, '\u2715');
titleRow.appendChild(titleText);
titleRow.appendChild(closeBtn);
panel.appendChild(titleRow);

// Content area
const content = createElement('div', { className: 'ek-content' });
const loadingStatus = createElement('div', { className: 'ek-status' }, 'Lade...');
content.appendChild(loadingStatus);
panel.appendChild(content);

widget.appendChild(toggle);
widget.appendChild(panel);
document.body.appendChild(widget);

// Toggle panel
let isOpen = false;
function setOpen(open: boolean) {
  isOpen = open;
  panel.classList.toggle('open', open);
  toggle.style.display = open ? 'none' : 'block';
  if (open) loadFirecall();
}

toggle.addEventListener('click', () => setOpen(true));
closeBtn.addEventListener('click', () => setOpen(false));

function showStatus(message: string) {
  content.replaceChildren();
  const status = createElement('div', { className: 'ek-status' }, message);
  content.appendChild(status);
}

function showFirecall(fc: { id: string; name?: string; description?: string; date?: string }) {
  content.replaceChildren();

  // Einsatz name
  const nameField = createElement('div', { className: 'ek-field' });
  nameField.appendChild(createElement('label', {}, 'Einsatz'));
  const nameStrong = createElement('strong', {}, fc.name || '\u2013');
  nameField.appendChild(nameStrong);
  content.appendChild(nameField);

  // Description (optional)
  if (fc.description) {
    const descField = createElement('div', { className: 'ek-field' });
    descField.appendChild(createElement('label', {}, 'Beschreibung'));
    descField.appendChild(document.createTextNode(fc.description));
    content.appendChild(descField);
  }

  // Date
  const dateField = createElement('div', { className: 'ek-field' });
  dateField.appendChild(createElement('label', {}, 'Datum'));
  const dateText = fc.date
    ? new Date(fc.date).toLocaleString('de-AT')
    : '\u2013';
  dateField.appendChild(document.createTextNode(dateText));
  content.appendChild(dateField);

  // Link to Einsatzkarte
  const link = createElement('a', {
    className: 'ek-link',
    href: `${EINSATZKARTE_URL}/einsatz/${fc.id}/details`,
    target: '_blank',
    rel: 'noopener noreferrer',
  }, 'In Einsatzkarte \u00f6ffnen \u2197');
  content.appendChild(link);
}

// Load firecall data from service worker
async function loadFirecall() {
  try {
    const authState = await chrome.runtime.sendMessage({
      type: 'GET_AUTH_STATE',
    });

    if (!authState.isLoggedIn) {
      showStatus('Nicht angemeldet. Bitte \u00fcber die Extension anmelden.');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'GET_CURRENT_FIRECALL',
    });

    if (response.error) {
      showStatus(response.error);
      return;
    }

    if (!response.firecall) {
      showStatus('Kein aktiver Einsatz');
      return;
    }

    showFirecall(response.firecall);
  } catch (err) {
    showStatus('Fehler beim Laden');
    console.error('Einsatzkarte extension error:', err);
  }
}
```

**Step 3: Update manifest.json**

Ensure the content script entry references the CSS file:

```json
"content_scripts": [
  {
    "matches": ["https://sybos.lfv-bgld.at/*"],
    "js": ["src/content/sybos.ts"],
    "css": ["src/content/sybos.css"]
  }
]
```

Note: CRXJS may handle CSS imports differently. If the CSS import in the TS file works via Vite, the explicit `css` entry in manifest.json may not be needed. Test both approaches.

**Step 4: Build and test**

```bash
cd chrome-extension && npm run build
```

Reload extension. Navigate to `sybos.lfv-bgld.at` → should see "EK" toggle on the right side → click → shows current firecall info.

If you don't have access to Sybos, test with a temporary `matches` override for a local URL.

**Step 5: Commit**

```bash
git add chrome-extension/src/content/ chrome-extension/manifest.json
git commit -m "feat(chrome-extension): add Sybos content script with firecall widget"
```

---

## Task 11: Header with Sign-Out & Polish

Add sign-out button, refine layout, add loading states and error boundaries.

**Files:**
- Create: `chrome-extension/src/popup/components/Header.tsx`
- Modify: `chrome-extension/src/popup/App.tsx` (final layout)

**Step 1: Create `chrome-extension/src/popup/components/Header.tsx`**

```tsx
import { AppBar, Toolbar, Typography, IconButton, Tooltip, Box } from '@mui/material';
import { Logout, OpenInNew } from '@mui/icons-material';
import { signOut } from '@shared/auth';
import { EINSATZKARTE_URL } from '@shared/config';

interface HeaderProps {
  email: string;
}

export default function Header({ email }: HeaderProps) {
  return (
    <AppBar position="static" color="primary" elevation={1}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 'bold' }}>
          Einsatzkarte
        </Typography>
        <Tooltip title="In Einsatzkarte öffnen">
          <IconButton
            size="small"
            color="inherit"
            onClick={() => chrome.tabs.create({ url: EINSATZKARTE_URL })}
          >
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={`Abmelden (${email})`}>
          <IconButton size="small" color="inherit" onClick={signOut}>
            <Logout fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
```

**Step 2: Finalize App.tsx layout**

Assemble all components into the final App layout:

1. Header (AppBar with sign-out)
2. FirecallSelect (dropdown)
3. Tabs (Übersicht | Tagebuch)
4. Tab content (FirecallOverview or DiaryList + DiaryForm)

**Step 3: Build, test end-to-end**

Full flow: Login → Select firecall → View overview → Switch to Tagebuch → Create entry → Verify in main app.

**Step 4: Commit**

```bash
git add chrome-extension/src/popup/
git commit -m "feat(chrome-extension): add header, sign-out, and polish layout"
```

---

## Task 12: Final Integration Test & README

**Files:**
- Create: `chrome-extension/README.md`

**Step 1: End-to-end testing checklist**

- [ ] Extension loads without errors
- [ ] Login works via Google OAuth
- [ ] Firecall dropdown shows active firecalls
- [ ] Most recent firecall auto-selected
- [ ] Selection persists across popup open/close
- [ ] Übersicht shows firecall details
- [ ] Tagebuch shows diary entries in real-time
- [ ] New diary entry form creates entries
- [ ] Entry appears in main Einsatzkarte app
- [ ] Sign-out works
- [ ] Sybos content script shows firecall widget
- [ ] "In Einsatzkarte öffnen" links work

**Step 2: Create `chrome-extension/README.md`**

Document:
- How to set up for development (`npm install`, `npm run dev`)
- How to load the extension in Chrome
- Google Cloud Console OAuth setup steps
- How to build for production
- How to switch between dev/prod Firestore

**Step 3: Final commit**

```bash
git add chrome-extension/
git commit -m "docs(chrome-extension): add README with setup instructions"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffolding | manifest.json, vite.config.ts, package.json |
| 2 | Firebase initialization | shared/firebase.ts, shared/config.ts |
| 3 | Google OAuth login | shared/auth.ts, components/Login.tsx |
| 4 | Shared Firestore types | shared/types.ts |
| 5 | Firecall selection | hooks/useFirecalls.ts, components/FirecallSelect.tsx |
| 6 | Firecall overview | hooks/useFirecallItems.ts, components/FirecallOverview.tsx |
| 7 | Diary list | hooks/useDiaries.ts, components/DiaryList.tsx |
| 8 | Diary entry form | components/DiaryForm.tsx |
| 9 | Background service worker | background/service-worker.ts |
| 10 | Sybos content script | content/sybos.ts, content/sybos.css |
| 11 | Header & polish | components/Header.tsx, App.tsx final |
| 12 | Integration test & README | README.md |
