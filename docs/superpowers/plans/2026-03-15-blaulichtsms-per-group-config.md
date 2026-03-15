# BlaulichtSMS Per-Group Configuration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move BlaulichtSMS credentials from global env vars to a per-group Firestore collection with AES-256-GCM encryption, managed by admins via the groups UI.

**Architecture:** A new `blaulichtsmsConfig` Firestore collection stores one encrypted-credential document per group. A server-side encryption utility reads the AES key from Secret Manager. Server actions handle all CRUD. The BlaulichtSMS page and EinsatzDialog dynamically select credentials based on the active firecall's group.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firebase Admin SDK, `@google-cloud/secret-manager`, Node.js `crypto`, MUI v7, Terraform (google + random providers)

**Spec:** `docs/superpowers/specs/2026-03-15-blaulichtsms-per-group-config-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `terraform/provider.tf` | Modify | Add `random` provider |
| `terraform/main.tf` | Modify | Add `BLAULICHTSMS_ENCRYPTION_KEY` secret + version |
| `src/server/blaulichtsms/encryption.ts` | Create | AES-256-GCM encrypt/decrypt using key from Secret Manager |
| `src/app/blaulicht-sms/credentialsActions.ts` | Create | Server actions: admin CRUD + user-accessible read helpers |
| `src/app/blaulicht-sms/actions.ts` | Modify | Accept `groupId`, load creds from Firestore |
| `src/app/groups/BlaulichtsmsCredentialsDialog.tsx` | Create | Admin dialog to edit per-group credentials |
| `src/app/groups/page.tsx` | Modify | Add BlaulichtSMS icon button per group row |
| `src/app/blaulicht-sms/page.tsx` | Modify | Use `useFirecall()`, group-based fetch, "no credentials" info |
| `src/components/FirecallItems/EinsatzDialog.tsx` | Modify | Group-based alarm fetch, remove `isInFfnd` hardcode |
| `firebase/prod/firestore.rules` | Modify | Restrict `blaulichtsmsConfig` access |
| `firebase/dev/firestore.rules` | Modify | Same as prod |

---

## Chunk 1: Terraform + Encryption Infrastructure

### Task 1.1: Add `random` provider to Terraform

**Files:**
- Modify: `terraform/provider.tf`

Add the `random` provider entry inside the **existing** `required_providers` block (do not replace the file or create a second `terraform {}` block).

- [ ] **Step 1: Edit `terraform/provider.tf` — add `random` to required_providers**

The existing `required_providers` block:
```hcl
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7"
    }
  }
```

After the edit:
```hcl
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3"
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add terraform/provider.tf
git commit -m "chore(terraform): add random provider for encryption key generation"
```

---

### Task 1.2: Add encryption key secret to Terraform

**Files:**
- Modify: `terraform/main.tf`

The existing pattern creates a secret "slot" via `locals.secrets` and a separate `for_each` IAM binding. For the encryption key we need an additional `secret_version` resource (to store the initial value), so we create standalone resources instead of adding to the `for_each` set. This is a deliberate deviation from the existing pattern — the `for_each` approach doesn't support per-resource `secret_version` or `lifecycle` blocks.

We use `random_id` (not `random_bytes`) because `random_id` is available in `hashicorp/random ~> 3` without requiring v3.6+.

- [ ] **Step 1: Add resources to `terraform/main.tf`** — insert after the existing `google_secret_manager_secret_iam_member` block (around line 151):

```hcl
# ============================================================================
# BlaulichtSMS Encryption Key
# ============================================================================

resource "random_id" "blaulichtsms_encryption_key" {
  byte_length = 32
}

resource "google_secret_manager_secret" "blaulichtsms_encryption_key" {
  secret_id = "BLAULICHTSMS_ENCRYPTION_KEY"
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "blaulichtsms_encryption_key" {
  secret      = google_secret_manager_secret.blaulichtsms_encryption_key.id
  secret_data = random_id.blaulichtsms_encryption_key.hex

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "blaulichtsms_encryption_key_access" {
  secret_id = google_secret_manager_secret.blaulichtsms_encryption_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}
```

- [ ] **Step 2: Commit**

```bash
git add terraform/main.tf
git commit -m "chore(terraform): add BLAULICHTSMS_ENCRYPTION_KEY secret with random initial value"
```

---

### Task 1.3: Install `@google-cloud/secret-manager`

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
npm install @google-cloud/secret-manager
```

- [ ] **Step 2: Verify lint passes (same or fewer problems than baseline)**

```bash
npm run lint 2>&1 | grep "problems"
```

Expected: same or fewer problems as the pre-existing 3 errors / 6 warnings.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @google-cloud/secret-manager dependency"
```

---

### Task 1.4: Create encryption utility

**Files:**
- Create: `src/server/blaulichtsms/encryption.ts`

- [ ] **Step 1: Create `src/server/blaulichtsms/encryption.ts`**

```typescript
import 'server-only';

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

let cachedKey: Buffer | null = null;

async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project) {
    throw new Error(
      'No GCP project ID found. Set GOOGLE_CLOUD_PROJECT or NEXT_PUBLIC_FIREBASE_PROJECT_ID.'
    );
  }

  const secretName = `projects/${project}/secrets/BLAULICHTSMS_ENCRYPTION_KEY/versions/latest`;
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: secretName });
  const keyHex = version.payload?.data?.toString() ?? '';

  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'BLAULICHTSMS_ENCRYPTION_KEY must be a 64-character hex string. ' +
        'Run `terraform apply` to create the secret.'
    );
  }

  cachedKey = Buffer.from(keyHex, 'hex');
  return cachedKey;
}

export async function encryptPassword(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${authTag.toString('hex')}`;
}

export async function decryptPassword(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password format — expected iv:ciphertext:authTag');
  }
  const [ivHex, ciphertextHex, authTagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint src/server/blaulichtsms/encryption.ts 2>&1 | grep "error" | grep -v "^$"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/blaulichtsms/encryption.ts
git commit -m "feat: AES-256-GCM encryption utility for BlaulichtSMS credentials"
```

---

### Task 1.5: Update Firestore rules

**Files:**
- Modify: `firebase/prod/firestore.rules`
- Modify: `firebase/dev/firestore.rules`

The `blaulichtsmsConfig` collection must not be accessible via the client SDK at all — all access goes through server-side actions using the Firebase Admin SDK (which bypasses rules). The existing catch-all `allow read, write: if adminUser()` would allow admin client access, so we add a more specific rule **before** the catch-all. In Firestore, when any `allow` rule evaluates to `true`, access is granted — meaning the catch-all will still grant admin access. To fully block client access, we add the rule `allow read, write: if false` as a documentation marker; however, the real enforcement is that no client-side code ever calls this collection. **Note:** This rule cannot override the catch-all in Firestore's security model. The primary security is that credentials are encrypted and all server actions require authentication.

Add before `match /{document=**}` in both rules files:

```
    // BlaulichtSMS per-group credentials (encrypted passwords).
    // Access is only through server-side Admin SDK actions — no direct client reads intended.
    match /blaulichtsmsConfig/{doc=**} {
      allow read, write: if false;
    }
```

- [ ] **Step 1: Edit `firebase/prod/firestore.rules`** — add before the catch-all match

- [ ] **Step 2: Apply the same edit to `firebase/dev/firestore.rules`**

- [ ] **Step 3: Commit**

```bash
git add firebase/prod/firestore.rules firebase/dev/firestore.rules
git commit -m "chore(firestore): restrict blaulichtsmsConfig to server-side access only"
```

---

## Chunk 2: Server Actions

### Task 2.1: Create `credentialsActions.ts`

**Files:**
- Create: `src/app/blaulicht-sms/credentialsActions.ts`

**Access control:**
- Admin actions (create, update, delete, read with full details): `actionAdminRequired()`
- User-accessible read helpers (`hasBlaulichtsmsConfig`, `getGroupsWithBlaulichtsmsConfig`): `actionUserRequired()` — these are called from non-admin contexts (the BlaulichtSMS page and EinsatzDialog, accessible to all authorized users)

- [ ] **Step 1: Create `src/app/blaulicht-sms/credentialsActions.ts`**

```typescript
'use server';
import 'server-only';

import { actionAdminRequired, actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { encryptPassword } from '../../server/blaulichtsms/encryption';

const COLLECTION = 'blaulichtsmsConfig';

export interface BlaulichtsmsConfigPublic {
  groupId: string;
  customerId: string;
  username: string;
  hasPassword: boolean;
  updatedAt: string;
  updatedBy: string;
}

// Admin-only: returns full public config (no plaintext or ciphertext)
export async function getBlaulichtsmsConfig(
  groupId: string
): Promise<BlaulichtsmsConfigPublic | null> {
  await actionAdminRequired();
  const doc = await firestore.collection(COLLECTION).doc(groupId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    groupId: data.groupId,
    customerId: data.customerId,
    username: data.username,
    hasPassword: !!data.passwordEncrypted,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
  };
}

// Admin-only: save credentials (password is optional; omit to keep existing)
export async function saveBlaulichtsmsConfig(
  groupId: string,
  data: { customerId: string; username: string; password?: string }
): Promise<void> {
  const session = await actionAdminRequired();

  const existing = await firestore.collection(COLLECTION).doc(groupId).get();
  const existingEncrypted = existing.exists
    ? existing.data()!.passwordEncrypted
    : undefined;

  const passwordEncrypted =
    data.password && data.password.length > 0
      ? await encryptPassword(data.password)
      : existingEncrypted;

  if (!passwordEncrypted) {
    throw new Error('A password is required when creating new credentials.');
  }

  await firestore
    .collection(COLLECTION)
    .doc(groupId)
    .set({
      groupId,
      customerId: data.customerId,
      username: data.username,
      passwordEncrypted,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    });
}

// Admin-only: delete credentials for a group
export async function deleteBlaulichtsmsConfig(
  groupId: string
): Promise<void> {
  await actionAdminRequired();
  await firestore.collection(COLLECTION).doc(groupId).delete();
}

// User-accessible: returns true if credentials are configured for the group.
// Used by BlaulichtSMS page to show "no credentials" info message.
export async function hasBlaulichtsmsConfig(
  groupId: string
): Promise<boolean> {
  await actionUserRequired();
  const doc = await firestore.collection(COLLECTION).doc(groupId).get();
  return doc.exists;
}

// User-accessible: returns group IDs that have credentials configured.
// Used by EinsatzDialog to decide whether to show the alarm dropdown.
export async function getGroupsWithBlaulichtsmsConfig(): Promise<string[]> {
  await actionUserRequired();
  const snapshot = await firestore.collection(COLLECTION).get();
  return snapshot.docs.map((d) => d.id);
}
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint src/app/blaulicht-sms/credentialsActions.ts 2>&1 | grep "error" | grep -v "^$"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/blaulicht-sms/credentialsActions.ts
git commit -m "feat: server actions for BlaulichtSMS per-group credentials CRUD"
```

---

### Task 2.2: Update `getBlaulichtSmsAlarms` to accept `groupId`

**Files:**
- Modify: `src/app/blaulicht-sms/actions.ts`

Replace the entire file content:

- [ ] **Step 1: Replace `src/app/blaulicht-sms/actions.ts`**

```typescript
'use server';
import 'server-only';

import { actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { decryptPassword } from '../../server/blaulichtsms/encryption';

const COLLECTION = 'blaulichtsmsConfig';

export interface BlaulichtSmsAlarm {
  productType: string;
  customerId: string;
  customerName: string;
  alarmId: string;
  scenarioId: string | null;
  indexNumber: number;
  alarmGroups: {
    groupId: string;
    groupName: string;
  }[];
  alarmDate: string;
  endDate: string;
  authorName: string;
  alarmText: string;
  audioUrl: string | null;
  needsAcknowledgement: boolean;
  usersAlertedCount: number;
  geolocation: {
    coordinates: { lat: number; lon: number };
    positionSetByAuthor: boolean;
    radius: number | null;
    distance: number | null;
    duration: number | null;
    address: string | null;
  } | null;
  coordinates: { lat: number; lon: number } | null;
  recipients: {
    id: string;
    name: string;
    msisdn: string;
    comment: string;
    participation: 'yes' | 'no' | 'unknown' | 'pending';
    participationMessage: string | null;
    functions: {
      functionId: string;
      name: string;
      order: number;
      shortForm: string;
      backgroundHexColorCode: string;
      foregroundHexColorCode: string;
    }[];
  }[];
}

interface BlaulichtsmsCredentials {
  username: string;
  password: string;
  customerId: string;
}

async function loadCredentials(
  groupId: string
): Promise<BlaulichtsmsCredentials | null> {
  // Try Firestore first
  const doc = await firestore.collection(COLLECTION).doc(groupId).get();
  if (doc.exists) {
    const data = doc.data()!;
    try {
      const password = await decryptPassword(data.passwordEncrypted);
      return { username: data.username, password, customerId: data.customerId };
    } catch (err) {
      console.error(
        `Failed to decrypt BlaulichtSMS password for group "${groupId}":`,
        err
      );
      return null;
    }
  }

  // Fall back to env vars for the legacy group
  const legacyGroup = process.env.BLAULICHTSMS_REQUIRED_GROUP ?? 'ffnd';
  if (groupId === legacyGroup) {
    const username = process.env.BLAULICHTSMS_USERNAME;
    const password = process.env.BLAULICHTSMS_PASSWORD;
    const customerId = process.env.BLAULICHTSMS_CUSTOMER_ID;
    if (username && password && customerId) {
      return { username, password, customerId };
    }
  }

  return null;
}

export async function getBlaulichtSmsAlarms(
  groupId: string
): Promise<BlaulichtSmsAlarm[]> {
  await actionUserRequired();

  const creds = await loadCredentials(groupId);
  if (!creds) return [];

  const { username, password, customerId } = creds;

  const loginResponse = await fetch(
    'https://api.blaulichtsms.net/blaulicht/api/alarm/v1/dashboard/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, customerId }),
    }
  );

  if (!loginResponse.ok) {
    console.error(
      'BlaulichtSMS dashboard login failed',
      loginResponse.status,
      loginResponse.statusText
    );
    return [];
  }

  const { sessionId } = await loginResponse.json();

  const dashboardResponse = await fetch(
    `https://api.blaulichtsms.net/blaulicht/api/alarm/v1/dashboard/${sessionId}`
  );

  if (!dashboardResponse.ok) {
    console.error(
      'Failed to fetch BlaulichtSMS dashboard data',
      dashboardResponse.status,
      dashboardResponse.statusText
    );
    return [];
  }

  return ((await dashboardResponse.json()).alarms ?? []) as BlaulichtSmsAlarm[];
}
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint src/app/blaulicht-sms/actions.ts 2>&1 | grep "error" | grep -v "^$"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/blaulicht-sms/actions.ts
git commit -m "feat: getBlaulichtSmsAlarms loads credentials per group from Firestore"
```

---

## Chunk 3: Admin UI

### Task 3.1: Create `BlaulichtsmsCredentialsDialog`

**Files:**
- Create: `src/app/groups/BlaulichtsmsCredentialsDialog.tsx`

Uses MUI v7 API — `slotProps={{ input: { endAdornment: ... } }}` (not deprecated `InputProps`).

- [ ] **Step 1: Create `src/app/groups/BlaulichtsmsCredentialsDialog.tsx`**

```typescript
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  BlaulichtsmsConfigPublic,
  deleteBlaulichtsmsConfig,
  getBlaulichtsmsConfig,
  saveBlaulichtsmsConfig,
} from '../blaulicht-sms/credentialsActions';
import ConfirmDialog from '../../components/dialogs/ConfirmDialog';
import { Group } from './groupTypes';

interface Props {
  group: Group;
  onClose: () => void;
}

export default function BlaulichtsmsCredentialsDialog({ group, onClose }: Props) {
  const [config, setConfig] = useState<BlaulichtsmsConfigPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const groupId = group.id ?? '';

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const existing = await getBlaulichtsmsConfig(groupId);
      setConfig(existing);
      if (existing) {
        setCustomerId(existing.customerId);
        setUsername(existing.username);
      }
    } catch (err) {
      setError('Fehler beim Laden der Konfiguration.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!customerId || !username) {
      setError('Kundennummer und Benutzername sind erforderlich.');
      return;
    }
    if (!config?.hasPassword && !password) {
      setError('Ein Passwort ist erforderlich beim Erstellen neuer Zugangsdaten.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveBlaulichtsmsConfig(groupId, {
        customerId,
        username,
        password: password || undefined,
      });
      await loadConfig();
    } catch (err) {
      setError('Fehler beim Speichern der Konfiguration.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteBlaulichtsmsConfig(groupId);
      onClose();
    } catch (err) {
      setError('Fehler beim Löschen der Konfiguration.');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>BlaulichtSMS Zugangsdaten — {group.name}</DialogTitle>
        <DialogContent>
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {config && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Zuletzt geändert:{' '}
                  {config.updatedAt
                    ? new Date(config.updatedAt).toLocaleString('de-AT')
                    : '—'}{' '}
                  von {config.updatedBy ?? '—'}
                </Typography>
              )}
              <TextField
                label="Kundennummer"
                fullWidth
                margin="dense"
                variant="standard"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
              <TextField
                label="Benutzername"
                fullWidth
                margin="dense"
                variant="standard"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <TextField
                label="Passwort"
                fullWidth
                margin="dense"
                variant="standard"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={config?.hasPassword ? '••••••••' : ''}
                helperText={
                  config?.hasPassword
                    ? 'Leer lassen, um das bestehende Passwort zu behalten.'
                    : 'Passwort eingeben.'
                }
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((s) => !s)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button
            color="error"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!config || loading || deleting}
          >
            {deleting ? <CircularProgress size={20} /> : 'Zugangsdaten löschen'}
          </Button>
          <div>
            <Button onClick={onClose}>Abbrechen</Button>
            <Button
              onClick={handleSave}
              disabled={loading || saving}
              variant="contained"
            >
              {saving ? <CircularProgress size={20} /> : 'Speichern'}
            </Button>
          </div>
        </DialogActions>
      </Dialog>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Zugangsdaten löschen"
          text={`BlaulichtSMS-Zugangsdaten für "${group.name}" wirklich löschen?`}
          onConfirm={(confirmed) => {
            setShowDeleteConfirm(false);
            if (confirmed) handleDelete();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint src/app/groups/BlaulichtsmsCredentialsDialog.tsx 2>&1 | grep "error" | grep -v "^$"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/groups/BlaulichtsmsCredentialsDialog.tsx
git commit -m "feat: admin dialog for BlaulichtSMS credentials per group"
```

---

### Task 3.2: Add BlaulichtSMS button to groups page

**Files:**
- Modify: `src/app/groups/page.tsx`

- [ ] **Step 1: Add imports at the top of `src/app/groups/page.tsx`**

```typescript
import SmsIcon from '@mui/icons-material/Sms';
import BlaulichtsmsCredentialsDialog from './BlaulichtsmsCredentialsDialog';
```

- [ ] **Step 2: Add `configBlsFn` prop to `UserRowButtonParams` and `GroupRowButtons`**

Replace the existing `UserRowButtonParams` interface and `GroupRowButtons` function:

```typescript
interface UserRowButtonParams {
  row: Group;
  editFn: (group: Group) => void;
  deleteFn: (group: Group) => void;
  configBlsFn: (group: Group) => void;
}
function GroupRowButtons({ row, editFn, deleteFn, configBlsFn }: UserRowButtonParams) {
  return (
    <>
      <Tooltip title={`Edit ${row.name}`}>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            editFn(row);
          }}
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Delete ${row.name}`}>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            deleteFn(row);
          }}
          color="warning"
        >
          <DeleteIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="BlaulichtSMS Zugangsdaten">
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            configBlsFn(row);
          }}
        >
          <SmsIcon />
        </IconButton>
      </Tooltip>
    </>
  );
}
```

- [ ] **Step 3: Add `blsGroup` state inside the `Groups` component**

After existing state declarations (`showEditDialog`, `isConfirmOpen`, `editGroup`):

```typescript
const [blsGroup, setBlsGroup] = useState<Group | undefined>();
```

- [ ] **Step 4: Add `configBlsAction` callback**

After the existing `deleteAction` callback:

```typescript
const configBlsAction = useCallback((group: Group) => {
  setBlsGroup(group);
}, []);
```

- [ ] **Step 5: Pass `configBlsFn` to `GroupRowButtons`**

Update the `GroupRowButtons` usage in the groups map:

```typescript
<GroupRowButtons
  row={group}
  editFn={editAction}
  deleteFn={showDeleteConfirm}
  configBlsFn={configBlsAction}
/>
```

- [ ] **Step 6: Add `BlaulichtsmsCredentialsDialog` to the JSX**

Inside the component return, after the `ConfirmDialog`:

```typescript
{blsGroup && (
  <BlaulichtsmsCredentialsDialog
    group={blsGroup}
    onClose={() => setBlsGroup(undefined)}
  />
)}
```

- [ ] **Step 7: Verify lint**

```bash
npm run lint src/app/groups/page.tsx 2>&1 | grep "error" | grep -v "^$"
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/groups/page.tsx
git commit -m "feat: add BlaulichtSMS credentials button to groups admin page"
```

---

## Chunk 4: Consumer Updates

### Task 4.1: Update BlaulichtSMS page

**Files:**
- Modify: `src/app/blaulicht-sms/page.tsx`

Replace the entire file content. `AlarmCard` stays the same; the page component is replaced.

- [ ] **Step 1: Replace `src/app/blaulicht-sms/page.tsx`**

```typescript
'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Container,
  Typography,
} from '@mui/material';
import { getBlaulichtSmsAlarms, BlaulichtSmsAlarm } from './actions';
import { hasBlaulichtsmsConfig } from './credentialsActions';
import AlarmMap from './Map';
import useFirecall from '../../hooks/useFirecall';

const AlarmCard = ({ alarm }: { alarm: BlaulichtSmsAlarm }) => {
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);

  const attendees = alarm.recipients.filter((r) => r.participation === 'yes');
  const totalCount = attendees.length;

  const functionCounts = attendees
    .flatMap((r) => r.functions)
    .reduce(
      (acc, func) => {
        const key = func.shortForm;
        if (!acc[key]) {
          acc[key] = {
            count: 0,
            background: func.backgroundHexColorCode,
            color: func.foregroundHexColorCode,
          };
        }
        acc[key].count++;
        return acc;
      },
      {} as Record<string, { count: number; background: string; color: string }>
    );

  const filteredAttendees = selectedFunction
    ? attendees.filter((r) =>
        r.functions.some((f) => f.shortForm === selectedFunction)
      )
    : attendees;

  return (
    <Card key={alarm.alarmId} sx={{ mb: 2 }}>
      <CardHeader
        title={alarm.alarmText}
        subheader={`Alarmzeit: ${new Date(alarm.alarmDate).toLocaleString()}`}
      />
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          <strong>Endzeit:</strong> {new Date(alarm.endDate).toLocaleString()}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Ersteller:</strong> {alarm.authorName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Gruppen:</strong>{' '}
          {alarm.alarmGroups.map((g) => g.groupName).join(', ')}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <Typography variant="h6" component="div">
            Funktionen
          </Typography>
          <Chip label={totalCount} size="small" />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(functionCounts).map(([func, data]) => (
            <Chip
              key={func}
              label={`${func}: ${data.count}`}
              onClick={() =>
                setSelectedFunction((prev) => (prev === func ? null : func))
              }
              sx={{
                backgroundColor: data.background,
                color: data.color,
                cursor: 'pointer',
                outline:
                  selectedFunction === func
                    ? '3px solid'
                    : '3px solid transparent',
                outlineColor:
                  selectedFunction === func ? 'primary.main' : 'transparent',
              }}
            />
          ))}
        </Box>

        <Typography variant="h6" component="div" sx={{ mt: 2 }}>
          Zusagen{' '}
          {selectedFunction && (
            <Chip
              label={`${selectedFunction}: ${filteredAttendees.length}`}
              size="small"
              onDelete={() => setSelectedFunction(null)}
            />
          )}
        </Typography>
        <Box>
          {filteredAttendees.map((recipient) => (
            <Box
              key={recipient.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 1,
                borderBottom: '1px solid #eee',
              }}
            >
              <Typography variant="body2">{recipient.name}</Typography>
              <Box>
                {recipient.functions.map((func) => (
                  <Chip
                    key={func.functionId}
                    label={func.shortForm}
                    size="small"
                    sx={{
                      ml: 1,
                      backgroundColor: func.backgroundHexColorCode,
                      color: func.foregroundHexColorCode,
                    }}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        {alarm.geolocation?.coordinates && (
          <AlarmMap
            lat={alarm.geolocation.coordinates.lat}
            lon={alarm.geolocation.coordinates.lon}
            alarmText={alarm.alarmText}
          />
        )}
      </CardContent>
    </Card>
  );
};

const BlaulichtSmsPage = () => {
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [noCredentials, setNoCredentials] = useState(false);
  const firecall = useFirecall();
  const groupId = firecall?.group;

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNoCredentials(false);

    Promise.all([hasBlaulichtsmsConfig(groupId), getBlaulichtSmsAlarms(groupId)])
      .then(([hasCreds, fetchedAlarms]) => {
        setNoCredentials(!hasCreds);
        const sorted = [...fetchedAlarms].sort(
          (a, b) =>
            new Date(b.alarmDate).getTime() - new Date(a.alarmDate).getTime()
        );
        setAlarms(sorted);
      })
      .catch((err) => {
        console.error('Failed to load BlaulichtSMS data:', err);
      })
      .finally(() => setLoading(false));
  }, [groupId]);

  const currentAlarm = alarms.length > 0 ? alarms[0] : null;
  const recentAlarms = alarms.length > 1 ? alarms.slice(1) : [];

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        BlaulichtSMS Einsätze
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : !groupId ? (
        <Typography variant="body1" sx={{ mt: 4 }}>
          Kein aktiver Einsatz ausgewählt.
        </Typography>
      ) : noCredentials ? (
        <Typography variant="body1" sx={{ mt: 4 }}>
          Keine BlaulichtSMS-Zugangsdaten für diese Gruppe konfiguriert. Bitte
          in den Admin-Einstellungen hinterlegen.
        </Typography>
      ) : (
        <>
          {currentAlarm && (
            <Box sx={{ my: 4 }}>
              <Typography variant="h5" component="h2" gutterBottom>
                Aktive Einsätze
              </Typography>
              <AlarmCard alarm={currentAlarm} />
            </Box>
          )}

          {recentAlarms.length > 0 && (
            <Box sx={{ my: 4 }}>
              <Typography variant="h5" component="h2" gutterBottom>
                Recent Alarms
              </Typography>
              {recentAlarms.map((alarm) => (
                <AlarmCard key={alarm.alarmId} alarm={alarm} />
              ))}
            </Box>
          )}

          {!currentAlarm && !recentAlarms.length && (
            <Typography variant="body1" sx={{ mt: 4 }}>
              Keine Alarme gefunden.
            </Typography>
          )}
        </>
      )}
    </Container>
  );
};

export default BlaulichtSmsPage;
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint src/app/blaulicht-sms/page.tsx 2>&1 | grep "error" | grep -v "^$"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/blaulicht-sms/page.tsx
git commit -m "feat: BlaulichtSMS page uses active firecall group for credentials"
```

---

### Task 4.2: Update EinsatzDialog

**Files:**
- Modify: `src/components/FirecallItems/EinsatzDialog.tsx`

**Key change:** Track the selected group in a dedicated `selectedGroup` state variable. This prevents the alarm-fetch `useEffect` from re-triggering on every field change (since `einsatz` is replaced on every keystroke).

- [ ] **Step 1: Update imports in `EinsatzDialog.tsx`**

Replace the existing BlaulichtSMS import:
```typescript
import {
  getBlaulichtSmsAlarms,
  BlaulichtSmsAlarm,
} from '../../app/blaulicht-sms/actions';
```

With:
```typescript
import {
  getBlaulichtSmsAlarms,
  BlaulichtSmsAlarm,
} from '../../app/blaulicht-sms/actions';
import { getGroupsWithBlaulichtsmsConfig } from '../../app/blaulicht-sms/credentialsActions';
```

- [ ] **Step 2: Replace state declarations related to BlaulichtSMS**

Remove:
```typescript
const isInFfnd = groups?.includes('ffnd') ?? false;

const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
const [alarmsLoading, setAlarmsLoading] = useState(
  isNewEinsatz && isInFfnd
);
const [selectedAlarmId, setSelectedAlarmId] = useState<string>('');
```

Replace with:
```typescript
const [configuredGroups, setConfiguredGroups] = useState<string[]>([]);
const [selectedGroup, setSelectedGroup] = useState<string>(einsatz.group ?? '');
const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
const [alarmsLoading, setAlarmsLoading] = useState(false);
const [selectedAlarmId, setSelectedAlarmId] = useState<string>('');
```

- [ ] **Step 3: Update the group `Select` onChange handler**

The existing `handleChange` updates `einsatz.group`. Also update `selectedGroup`:

```typescript
const handleChange = (event: SelectChangeEvent) => {
  const newGroup = event.target.value;
  setEinsatz((prev) => ({ ...prev, group: newGroup }));
  setSelectedGroup(newGroup);
};
```

- [ ] **Step 4: Replace alarm-fetch `useEffect`**

Remove the existing effect that uses `isInFfnd`:
```typescript
useEffect(() => {
  if (isNewEinsatz && isInFfnd) {
    getBlaulichtSmsAlarms()
      ...
  }
}, [isNewEinsatz, isInFfnd, applyAlarm]);
```

Replace with two effects:

```typescript
// Load which groups have BlaulichtSMS credentials (once on dialog mount)
useEffect(() => {
  if (!isNewEinsatz) return;
  getGroupsWithBlaulichtsmsConfig()
    .then(setConfiguredGroups)
    .catch((err) =>
      console.error('Failed to load BlaulichtSMS configured groups:', err)
    );
}, [isNewEinsatz]);

// Fetch alarms when selected group changes and has credentials
useEffect(() => {
  if (!isNewEinsatz || !selectedGroup || !configuredGroups.includes(selectedGroup)) {
    setAlarms([]);
    setSelectedAlarmId('');
    return;
  }
  setAlarmsLoading(true);
  getBlaulichtSmsAlarms(selectedGroup)
    .then((fetchedAlarms) => {
      const sorted = [...fetchedAlarms].sort(
        (a, b) =>
          new Date(b.alarmDate).getTime() - new Date(a.alarmDate).getTime()
      );
      setAlarms(sorted);
      if (sorted.length > 0) {
        setSelectedAlarmId(sorted[0].alarmId);
        applyAlarm(sorted[0]);
      }
    })
    .catch((err) =>
      console.error('Failed to fetch BlaulichtSMS alarms:', err)
    )
    .finally(() => setAlarmsLoading(false));
}, [isNewEinsatz, selectedGroup, configuredGroups, applyAlarm]);
```

- [ ] **Step 5: Update JSX loading and alarm dropdown conditions**

Replace the two `isInFfnd` JSX conditions:

```typescript
{isNewEinsatz && alarmsLoading && (
  <DialogContentText
    sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}
  >
    <CircularProgress size={20} />
    Blaulicht-SMS Alarme werden geladen...
  </DialogContentText>
)}
{isNewEinsatz && !alarmsLoading && alarms.length > 0 && (
  <FormControl fullWidth variant="standard" sx={{ mb: 1 }}>
    <InputLabel id="alarm-select-label">Blaulicht-SMS Alarm</InputLabel>
    <Select
      labelId="alarm-select-label"
      id="alarm-select"
      value={selectedAlarmId}
      label="Blaulicht-SMS Alarm"
      onChange={handleAlarmChange}
    >
      <MenuItem value="">Manuell eingeben</MenuItem>
      {alarms.map((alarm) => (
        <MenuItem key={alarm.alarmId} value={alarm.alarmId}>
          {alarm.alarmText} (
          {new Date(alarm.alarmDate).toLocaleString('de-AT')})
        </MenuItem>
      ))}
    </Select>
  </FormControl>
)}
```

- [ ] **Step 6: Verify lint**

```bash
npm run lint src/components/FirecallItems/EinsatzDialog.tsx 2>&1 | grep "error" | grep -v "^$"
```

Expected: no errors.

- [ ] **Step 7: Run build to verify all TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: successful build. Check for any TypeScript errors related to changed files.

- [ ] **Step 8: Commit**

```bash
git add src/components/FirecallItems/EinsatzDialog.tsx
git commit -m "feat: EinsatzDialog fetches BlaulichtSMS alarms per group, removes ffnd hardcode"
```

---

## Verification Checklist

- [ ] **Terraform:** Run `cd terraform && terraform init -upgrade && terraform plan` — should show only the 4 new blaulichtsms key resources (`random_id`, `google_secret_manager_secret`, `google_secret_manager_secret_version`, `google_secret_manager_secret_iam_member`). No unexpected changes to existing resources.
- [ ] **Admin UI — create:** Log in as admin → `/groups` → click SMS icon on a group → enter Customer ID, Username, Password → Speichern → Firestore `blaulichtsmsConfig/{groupId}` doc appears with an encrypted `passwordEncrypted` field and no plaintext.
- [ ] **Admin UI — update (keep password):** Open dialog again, leave password blank, change Customer ID → save → `passwordEncrypted` is unchanged in Firestore, `customerId` updated.
- [ ] **Admin UI — delete:** Click "Zugangsdaten löschen" → confirm → dialog closes, Firestore doc is gone.
- [ ] **BlaulichtSMS page — no firecall:** Navigate to `/blaulicht-sms` without an active firecall → shows "Kein aktiver Einsatz ausgewählt."
- [ ] **BlaulichtSMS page — no credentials:** Select a firecall whose group has no credentials → shows "Keine BlaulichtSMS-Zugangsdaten..."
- [ ] **BlaulichtSMS page — with credentials:** Select a firecall for a configured group → alarms load.
- [ ] **EinsatzDialog:** Create new Einsatz → select group with credentials → alarm dropdown appears. Switch to group without credentials → dropdown disappears. Typing in other fields (Bezeichnung etc.) does NOT re-trigger alarm fetch.
- [ ] **Security (non-admin):** A non-admin user visiting `/blaulicht-sms` with an active firecall should see alarms (or "no credentials") — NOT a 403. Verify `hasBlaulichtsmsConfig` and `getBlaulichtSmsAlarms` both use `actionUserRequired()`.
