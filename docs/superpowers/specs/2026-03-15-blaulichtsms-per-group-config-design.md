# BlaulichtSMS Per-Group Configuration — Design Spec

**Date:** 2026-03-15
**Status:** Approved

## Context

BlaulichtSMS credentials (customer ID, username, password) were previously global — stored as environment variables injected via Cloud Secret Manager into the Cloud Run service. This works for a single-group deployment but doesn't scale when multiple fire departments (groups) use the same application.

The goal is to store credentials per group in Firestore, encrypted at rest, manageable by admins through the existing groups UI, and consumed dynamically based on the active firecall's group.

---

## Data Model

**Firestore collection:** `blaulichtsmsConfig`
**Document ID:** group ID (e.g., `ffnd`)
**Access:** Admin SDK only (server-side). Firestore rules deny all client-side access.

```typescript
// Stored in Firestore (never returned to client)
interface BlaulichtsmsConfig {
  groupId: string;
  customerId: string;
  username: string;
  passwordEncrypted: string; // AES-256-GCM: "iv_hex:ciphertext_hex:authTag_hex"
  updatedAt: string;         // ISO string, consistent with project convention
  updatedBy: string;
}

// Returned to the admin UI — no encrypted password field
interface BlaulichtsmsConfigPublic {
  groupId: string;
  customerId: string;
  username: string;
  hasPassword: boolean;      // true if credentials are stored
  updatedAt: string;
  updatedBy: string;
}
```

**Encryption key:** `BLAULICHTSMS_ENCRYPTION_KEY` in Cloud Secret Manager.

- 32 random bytes, hex-encoded (64 chars).
- Created and populated by Terraform using `random_bytes` + `google_secret_manager_secret_version`.
- Accessed server-side at runtime via the `@google-cloud/secret-manager` SDK (not injected as an env var — avoids plaintext key in the process environment).
- Cached in-process for the lifetime of a container instance. **Key rotation requires a container restart.** This is an accepted limitation; document in the admin runbook.

---

## Architecture

### Encryption Utility

**`src/server/blaulichtsms/encryption.ts`**

- `encryptPassword(plaintext: string): Promise<string>` — loads key from Secret Manager (`latest` version), generates a random 12-byte IV, encrypts with AES-256-GCM, returns `"${iv_hex}:${ciphertext_hex}:${authTag_hex}"`.
- `decryptPassword(encrypted: string): Promise<string>` — parses the three-part format and decrypts.
- Key is loaded once per process and cached in a module-level variable.
- On Secret Manager failure: throws an `Error` with a descriptive message. Callers must handle this and surface an appropriate error to the UI or log it and return empty (see per-caller policy below).

### Server Actions

**`src/app/blaulicht-sms/credentialsActions.ts`**

All actions are protected with `actionAdminRequired()`.

- `getBlaulichtsmsConfig(groupId: string): Promise<BlaulichtsmsConfigPublic | null>` — reads from Firestore, maps to `BlaulichtsmsConfigPublic` (strips `passwordEncrypted`, adds `hasPassword: !!doc.passwordEncrypted`). Never returns the encrypted ciphertext to the client.
- `saveBlaulichtsmsConfig(groupId: string, data: { customerId: string; username: string; password?: string }): Promise<void>` — if `password` is provided and non-empty, encrypts and stores it; if `password` is absent or empty string, preserves the existing `passwordEncrypted` field (merge update). On Secret Manager failure, throws to the client.
- `deleteBlaulichtsmsConfig(groupId: string): Promise<void>` — deletes the document.
- `hasBlaulichtsmsConfig(groupId: string): Promise<boolean>` — returns `true` if a config document exists for the group. Used by `page.tsx` to show the "no credentials" info message.
- `getGroupsWithBlaulichtsmsConfig(): Promise<string[]>` — returns array of group IDs that have credentials (by listing `blaulichtsmsConfig` collection documents). Called once per `EinsatzDialog` mount in a `useEffect([], [])`.

### Modified `getBlaulichtSmsAlarms`

**`src/app/blaulicht-sms/actions.ts`**

Signature: `getBlaulichtSmsAlarms(groupId: string): Promise<BlaulichtSmsAlarm[]>`

Logic:

1. Requires `actionUserRequired()`.
2. Load config from `blaulichtsmsConfig/{groupId}` via Admin SDK.
3. If found, decrypt the password and use the group's credentials.
4. If not found in Firestore, fall back to `BLAULICHTSMS_*` environment variables **only if** `groupId === (process.env.BLAULICHTSMS_REQUIRED_GROUP ?? 'ffnd')`. This comparison is on the `groupId` parameter, not on user group membership (user authorization is already handled by `actionUserRequired()`).
5. If neither source is available, return empty array.
6. On decryption failure (Secret Manager unavailable): log the error and return empty array (alarm fetch is non-critical; the page will show "No alarms found" rather than crash).

**Both callers are updated:**

- `page.tsx`: gets `groupId` from `useFirecall().group`
- `EinsatzDialog.tsx`: gets `groupId` from the currently selected group in the dialog

### BlaulichtSMS Page

**`src/app/blaulicht-sms/page.tsx`**

`FirecallProvider` is provided globally via `AppProviders`, so `useFirecall()` is available on this page.

- Add `const firecall = useFirecall()` to get the current active firecall.
- Add a separate `useState<boolean>` for `noCredentials`.
- Before fetching, check: if `!firecall.group` → show "Kein aktiver Einsatz ausgewählt."
- Call `hasBlaulichtsmsConfig(firecall.group)` (from `credentialsActions.ts`) and `getBlaulichtSmsAlarms(firecall.group)` concurrently. If `hasBlaulichtsmsConfig` returns `false` → show "Keine BlaulichtSMS-Zugangsdaten für diese Gruppe konfiguriert."

### EinsatzDialog

**`src/components/FirecallItems/EinsatzDialog.tsx`**

- Remove the hardcoded `isInFfnd` check.
- In a `useEffect(() => { ... }, [])` (empty deps, runs once on dialog mount), call `getGroupsWithBlaulichtsmsConfig()` to get the list of configured group IDs. Store in state.
- When the selected group changes, if the new group is in the configured list, fetch alarms via `getBlaulichtSmsAlarms(selectedGroup)`. If not in the list, clear alarms.
- Show the alarm dropdown only when alarms are loaded and the selected group is configured.

### Admin UI — Groups Page

**`src/app/groups/page.tsx`**

- Add a third icon button per group row: `SmsIcon` (or `VpnKeyIcon`) with tooltip "BlaulichtSMS Konfiguration".
- On click, open `BlaulichtsmsCredentialsDialog` for that group.

**`src/app/groups/BlaulichtsmsCredentialsDialog.tsx`**

- MUI Dialog component, admin-only.
- On open: calls `getBlaulichtsmsConfig(groupId)`. If config exists, pre-fills Customer ID and Username. Password field shows placeholder "••••••••" (leave blank to keep existing password).
- Form fields: Customer ID, Username, Password (text field with show/hide toggle).
- "Speichern" → calls `saveBlaulichtsmsConfig(groupId, { customerId, username, password: password || undefined })` — passes `undefined` if password field is blank to preserve existing.
- "Zugangsdaten löschen" (danger button) → opens existing `ConfirmDialog` component for confirmation, then calls `deleteBlaulichtsmsConfig(groupId)`.

---

## Security

- `blaulichtsmsConfig` documents are never accessible client-side. Firebase Admin SDK bypasses Firestore rules.
- Firestore rules explicitly deny all access: `allow read, write: if false;` for `blaulichtsmsConfig/{document=**}`.
- Passwords are AES-256-GCM encrypted before storage. The encryption key lives in Secret Manager and is never injected as an env var.
- `BlaulichtsmsConfigPublic` (returned to admin UI) never includes the ciphertext — only `hasPassword: boolean`.
- All credential CRUD requires `actionAdminRequired()`.

---

## Terraform Changes

**`terraform/main.tf`**

1. Add `BLAULICHTSMS_ENCRYPTION_KEY` to `locals.secrets` (for IAM binding on existing `secret_access` resource).
2. Add `resource "random_bytes" "blaulichtsms_key" { length = 32 }`.
3. Add a separate `google_secret_manager_secret` + `google_secret_manager_secret_version` for `BLAULICHTSMS_ENCRYPTION_KEY`, with `value = random_bytes.blaulichtsms_key.hex`. Use `lifecycle { ignore_changes = [value] }` to prevent Terraform from rotating the key on every apply after initial creation.
4. **No Cloud Run env var mounting** for `BLAULICHTSMS_ENCRYPTION_KEY` — accessed via SDK at runtime, not as an env var.

The old `BLAULICHTSMS_USERNAME`, `BLAULICHTSMS_PASSWORD`, `BLAULICHTSMS_CUSTOMER_ID` secrets remain in Terraform for migration continuity. Cloud Run deployment can stop injecting them as env vars once all groups are migrated.

---

## Firestore Rules

Apply to both `firebase/prod/firestore.rules` and `firebase/dev/firestore.rules`:

```javascript
match /blaulichtsmsConfig/{document=**} {
  allow read, write: if false;
}
```

**Dev environment note:** The `BLAULICHTSMS_ENCRYPTION_KEY` secret should be created in the same GCP project used for dev (`ffndev`). If dev uses a shared GCP project, no extra work is needed.

---

## Verification

1. **Terraform:** `terraform plan` should show `random_bytes.blaulichtsms_key`, `google_secret_manager_secret.blaulichtsms_encryption_key`, and the `google_secret_manager_secret_version` without errors. No other resources should change.
2. **Admin UI:** Log in as admin → `/groups` → click BlaulichtSMS icon on 'ffnd' group → enter credentials → save. Verify Firestore document `blaulichtsmsConfig/ffnd` appears with an encrypted `passwordEncrypted` field. Verify `hasPassword: true` on subsequent open of the dialog.
3. **BlaulichtSMS page:** Select 'ffnd' as active firecall → navigate to `/blaulicht-sms` → alarms should load. Switch to a firecall with a group that has no credentials → info message shown. Navigate to `/blaulicht-sms` without any active firecall → "Kein aktiver Einsatz ausgewählt" message.
4. **EinsatzDialog:** Create new Einsatz → select 'ffnd' group (which has credentials) → alarm dropdown appears. Select a group without credentials → dropdown not shown.
5. **Security:** Attempt to read `blaulichtsmsConfig/ffnd` from client-side Firebase SDK → denied by Firestore rules.
6. **Password update (keep existing):** Open credentials dialog for a configured group, clear the password field, save → password is unchanged in Firestore (verify `passwordEncrypted` is the same value).
