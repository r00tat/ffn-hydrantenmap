# Bug Report / Feature Request Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an in-app Bug Report / Feature Request feature that captures title, description, automatic context, debug logs, and optional screenshots. Stores reports in Firestore (`/bugReport`), files in Cloud Storage (`/bugReports/{id}/...`), and sends a notification mail to a centrally configured admin address.

**Architecture:** Globaler `BugReportProvider` mountet `<BugReportDialog />` einmal in `AppProviders`. Drawer-Eintrag öffnet den Dialog ohne Pfadwechsel — Karte bleibt für Screenshot sichtbar. Screenshot via `navigator.mediaDevices.getDisplayMedia()` (kein NPM-Paket). Submit erzeugt `reportId`, lädt Anhänge parallel ins Storage und ruft eine Server Action auf, die das Firestore-Doc mit `createdBy` aus dem Auth-Token schreibt und best-effort eine Notification-Mail über Gmail Workspace API versendet. Admin-UI unter `/admin/bug-reports` zeigt Liste + Detail + Empfänger-Config.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, MUI 9, Firebase (Firestore + Storage), Gmail Workspace API (`@googleapis/gmail`), Vitest + Testing Library, Capacitor 8 für Plattform-Detection.

**Referenz:** [docs/plans/2026-05-11-bug-report-design.md](2026-05-11-bug-report-design.md)

**Konventionen für diese Plan-Ausführung:**

- **TDD:** Test zuerst, dann Code.
- **Keine Zwischen-Commits.** Es gibt **einen einzigen finalen Commit** am Ende (Task 18).
- **Keine Zwischen-Checks.** `tsc`/`eslint`/`vitest`/`next build` laufen ausschließlich in Task 17 — nicht nach jedem Schritt.
- Tests stehen direkt neben der Source (`foo.ts` → `foo.test.ts`). Keine `__tests__/`-Ordner.
- Server Actions starten mit `'use server'` + ggf. `import 'server-only'`; jeder Action ruft als erstes den passenden Auth-Guard (`actionUserRequired` / `actionAdminRequired`).
- Bestehende Patterns wiederverwenden: `useSnackbar` aus `components/providers/SnackbarProvider`, `useDebugLogging` aus `hooks/useDebugging`, `useFirecall`/`useFirecallId` aus `hooks/useFirecall`, `uploadBytesResumable` analog zu `components/inputs/FileUploader.tsx`, Gmail-Versand analog zu `components/Kostenersatz/kostenersatzEmailAction.ts`.

---

## Task 1: Common Types

**Files:**
- Create: `src/common/bugReport.ts`

**Inhalt:**

```ts
import { Timestamp } from 'firebase/firestore';

export const BUG_REPORT_COLLECTION = 'bugReport';
export const APP_CONFIG_COLLECTION = 'appConfig';
export const BUG_REPORT_CONFIG_DOC = 'bugReport';
export const BUG_REPORT_STORAGE_PREFIX = 'bugReports';
export const BUG_REPORT_MAX_LOG_ENTRIES = 200;

export type BugReportKind = 'bug' | 'feature';
export type BugReportStatus = 'open' | 'in_progress' | 'closed' | 'wontfix';

export interface BugReportLogEntry {
  message: string;
  level?: string;
  properties?: Record<string, unknown>;
}

export interface BugReportContext {
  url: string;
  pathname: string;
  buildId: string;
  database: string;
  userAgent: string;
  platform: string;
  isNative: boolean;
  firecallId?: string;
  firecallName?: string;
  viewport: { width: number; height: number };
  locale: string;
}

export interface BugReportCreatedBy {
  uid: string;
  email: string;
  displayName?: string;
}

export interface BugReport {
  id: string;
  kind: BugReportKind;
  title: string;
  description: string;
  status: BugReportStatus;
  createdAt: Timestamp | Date | string;
  createdBy: BugReportCreatedBy;
  context: BugReportContext;
  logs: BugReportLogEntry[];
  screenshots: string[];
  attachments: string[];
  notificationError?: string;
  updatedAt?: Timestamp | Date | string;
  updatedBy?: BugReportCreatedBy;
}

export interface BugReportSubmitInput {
  reportId: string;
  kind: BugReportKind;
  title: string;
  description: string;
  context: BugReportContext;
  logs: BugReportLogEntry[];
  screenshots: string[];
  attachments: string[];
}

export interface BugReportConfig {
  recipientEmails: string[];
  enabled: boolean;
  updatedAt?: Timestamp | Date | string;
  updatedBy?: BugReportCreatedBy;
}

export const DEFAULT_BUG_REPORT_CONFIG: BugReportConfig = {
  recipientEmails: [],
  enabled: true,
};
```

Keine Tests — pure Types/Konstanten.

---

## Task 2: Firestore Rules

**Files:**
- Modify: `firebase/prod/firestore.rules`
- Modify: `firebase/dev/firestore.rules`

**In beiden Dateien**, direkt **vor** dem Fall-Through-Block `match /{document=**}`, einfügen:

```
match /bugReport/{doc} {
  allow create: if authorizedUser()
    && request.resource.data.createdBy.uid == request.auth.uid
    && request.resource.data.createdBy.email == request.auth.token.email
    && request.resource.data.kind in ['bug', 'feature']
    && request.resource.data.status == 'open';
  allow read, update, delete: if adminUser();
}

match /appConfig/{doc=**} {
  allow read, write: if false;
}
```

`dev/firestore.rules` falls die `adminUser()`-Helper anders heißt: dieselbe Helper-Definition verwenden, die bereits dort steht (analog `prod`). Wenn die `dev`-Datei abweicht, beim Einfügen anpassen.

---

## Task 3: Storage Rules

**Files:**
- Modify: `storage.rules`

**Im `service firebase.storage > match /b/{bucket}/o`-Block**, direkt nach dem bestehenden `/firecall/...`-Match, einfügen:

```
match /bugReports/{reportId}/{fileName} {
  allow create: if authorizedUser();
  allow read: if false;  // nur Admin SDK liest Anhänge (Admin-UI lädt signed URLs server-seitig)
}
```

Die bestehende `authorizedUser()`-Funktion oben im File wird wiederverwendet.

---

## Task 4: captureScreenshot Utility

**Files:**
- Create: `src/components/bugReport/captureScreenshot.ts`
- Test: `src/components/bugReport/captureScreenshot.test.ts`

**Step 1: Test schreiben**

```ts
// captureScreenshot.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureScreenshot, isScreenshotSupported } from './captureScreenshot';

describe('isScreenshotSupported', () => {
  it('returns true when getDisplayMedia exists', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getDisplayMedia: vi.fn() } },
    });
    expect(isScreenshotSupported()).toBe(true);
  });

  it('returns false when mediaDevices missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    expect(isScreenshotSupported()).toBe(false);
  });
});

describe('captureScreenshot', () => {
  let stopSpy: ReturnType<typeof vi.fn>;
  let track: { stop: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stopSpy = vi.fn();
    track = { stop: stopSpy };

    const stream = { getTracks: () => [track] } as unknown as MediaStream;

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
      },
    });

    // jsdom video / canvas stubs
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 320 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 240 });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/png' }));
    } as any;

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a PNG blob and stops the track', async () => {
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/png');
    expect(stopSpy).toHaveBeenCalled();
  });

  it('returns null and stops the track when user cancels', async () => {
    (navigator.mediaDevices.getDisplayMedia as any).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );
    const blob = await captureScreenshot();
    expect(blob).toBeNull();
  });
});
```

**Step 2: Run test → FAIL**

`npx vitest run src/components/bugReport/captureScreenshot.test.ts`

**Step 3: Implementation**

```ts
// captureScreenshot.ts
export function isScreenshotSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

export async function captureScreenshot(): Promise<Blob | null> {
  if (!isScreenshotSupported()) return null;

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
  } catch {
    return null;
  }

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1;
    canvas.height = video.videoHeight || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
```

---

## Task 5: collectContext Utility

**Files:**
- Create: `src/components/bugReport/collectContext.ts`
- Test: `src/components/bugReport/collectContext.test.ts`

**Step 1: Test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectContext } from './collectContext';
import type { Firecall } from '../firebase/firestore';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}));

describe('collectContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects browser context with firecall metadata', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://x/y', pathname: '/y' },
      innerWidth: 1024,
      innerHeight: 768,
      navigator: { userAgent: 'UA', language: 'de-AT' },
    });

    const ctx = collectContext({
      pathname: '/y',
      firecall: { id: 'fc1', name: 'Einsatz 1' } as Firecall,
      buildId: 'b1',
      database: 'ffndev',
    });

    expect(ctx).toMatchObject({
      url: 'https://x/y',
      pathname: '/y',
      buildId: 'b1',
      database: 'ffndev',
      userAgent: 'UA',
      platform: 'web',
      isNative: false,
      firecallId: 'fc1',
      firecallName: 'Einsatz 1',
      viewport: { width: 1024, height: 768 },
      locale: 'de-AT',
    });
  });

  it('omits firecallId when no firecall', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://x/', pathname: '/' },
      innerWidth: 100,
      innerHeight: 100,
      navigator: { userAgent: 'UA', language: 'de' },
    });
    const ctx = collectContext({ pathname: '/', buildId: '', database: '' });
    expect(ctx.firecallId).toBeUndefined();
    expect(ctx.firecallName).toBeUndefined();
  });
});
```

**Step 2: FAIL.**

**Step 3: Implementation**

```ts
// collectContext.ts
import { Capacitor } from '@capacitor/core';
import type { BugReportContext } from '../../common/bugReport';
import type { Firecall } from '../firebase/firestore';

interface CollectContextArgs {
  pathname: string;
  firecall?: Firecall;
  buildId: string;
  database: string;
}

export function collectContext({
  pathname,
  firecall,
  buildId,
  database,
}: CollectContextArgs): BugReportContext {
  const w = typeof window !== 'undefined' ? window : (undefined as any);
  const nav = w?.navigator;
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  const context: BugReportContext = {
    url: w?.location?.href ?? '',
    pathname,
    buildId,
    database,
    userAgent: nav?.userAgent ?? '',
    platform,
    isNative,
    viewport: {
      width: w?.innerWidth ?? 0,
      height: w?.innerHeight ?? 0,
    },
    locale: nav?.language ?? '',
  };

  if (firecall?.id && firecall.id !== 'unknown') {
    context.firecallId = firecall.id;
    context.firecallName = firecall.name;
  }
  return context;
}
```

---

## Task 6: uploadBugReportFile Helper

**Files:**
- Create: `src/components/bugReport/uploadBugReportFile.ts`

Kein eigener Test (dünner Wrapper um Firebase Storage; in DialogTests gemockt).

```ts
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import app from '../firebase/firebase';
import { BUG_REPORT_STORAGE_PREFIX } from '../../common/bugReport';

const storage = getStorage(app);

export async function uploadBugReportFile(
  reportId: string,
  file: Blob,
  fileName: string,
  contentType?: string,
): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileRef = ref(
    storage,
    `/${BUG_REPORT_STORAGE_PREFIX}/${reportId}/${uuid()}-${safeName}`,
  );
  const task = uploadBytesResumable(fileRef, file, {
    contentType: contentType ?? file.type,
  });
  await task;
  return task.snapshot.ref.fullPath;
}
```

---

## Task 7: buildBugReportEmail Helper (server-only)

**Files:**
- Create: `src/components/bugReport/buildBugReportEmail.ts`
- Test: `src/components/bugReport/buildBugReportEmail.test.ts`

**Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { buildBugReportEmail } from './buildBugReportEmail';
import type { BugReport } from '../../common/bugReport';

const baseReport: BugReport = {
  id: 'r1',
  kind: 'bug',
  title: 'Karte lädt nicht',
  description: 'Beim Öffnen…',
  status: 'open',
  createdAt: '2026-05-11T10:00:00.000Z',
  createdBy: { uid: 'u1', email: 'max@ff-neusiedlamsee.at', displayName: 'Max' },
  context: {
    url: 'https://app/x', pathname: '/x', buildId: 'b1', database: '',
    userAgent: 'UA', platform: 'web', isNative: false,
    firecallId: 'fc1', firecallName: 'Einsatz 1',
    viewport: { width: 100, height: 100 }, locale: 'de-AT',
  },
  logs: [], screenshots: [], attachments: [],
};

describe('buildBugReportEmail', () => {
  it('prefixes subject with [Bug] for bug kind', () => {
    const { subject } = buildBugReportEmail({
      report: baseReport,
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(subject).toMatch(/^\[Bug\] Karte lädt nicht/);
    expect(subject).toContain('max@ff-neusiedlamsee.at');
  });

  it('prefixes subject with [Feature] for feature kind', () => {
    const { subject } = buildBugReportEmail({
      report: { ...baseReport, kind: 'feature' },
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(subject).toMatch(/^\[Feature\]/);
  });

  it('includes a direct link and firecall name in body', () => {
    const { body } = buildBugReportEmail({
      report: baseReport,
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(body).toContain('https://app/admin/bug-reports/r1');
    expect(body).toContain('Einsatz 1');
  });

  it('produces an RFC-2822 raw message with UTF-8 subject', () => {
    const { raw } = buildBugReportEmail({
      report: baseReport,
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(raw).toContain('From: noreply@x');
    expect(raw).toContain('To: admin@x');
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
  });
});
```

**Step 2: FAIL.**

**Step 3: Implementation**

```ts
// buildBugReportEmail.ts
import 'server-only';
import type { BugReport } from '../../common/bugReport';

interface BuildArgs {
  report: BugReport;
  appBaseUrl: string;
  from: string;
  to: string;        // erste Adresse als To, Rest als Cc — Empfänger übergibt Caller
  cc?: string[];
}

interface BuiltEmail {
  subject: string;
  body: string;
  raw: string;
}

export function buildBugReportEmail({
  report,
  appBaseUrl,
  from,
  to,
  cc,
}: BuildArgs): BuiltEmail {
  const kindLabel = report.kind === 'feature' ? 'Feature' : 'Bug';
  const subject = `[${kindLabel}] ${report.title} — ${report.createdBy.email}`;

  const firecall = report.context.firecallName ?? '-';
  const dbLabel = report.context.database || 'prod';
  const userLabel = report.createdBy.displayName
    ? `${report.createdBy.displayName} <${report.createdBy.email}>`
    : report.createdBy.email;

  const body = [
    `Neuer Report (${report.kind}):`,
    '',
    `Titel:     ${report.title}`,
    `User:      ${userLabel}`,
    `Datum:     ${report.createdAt}`,
    `URL:       ${report.context.url}`,
    `Build:     ${report.context.buildId} (${dbLabel})`,
    `Plattform: ${report.context.platform}`,
    `Firecall:  ${firecall}`,
    '',
    'Beschreibung:',
    report.description,
    '',
    `Direkt-Link: ${appBaseUrl.replace(/\/$/, '')}/admin/bug-reports/${report.id}`,
  ].join('\r\n');

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ].join('\r\n');

  const raw = [headers, '', textPart, `--${boundary}--`].join('\r\n');
  return { subject, body, raw };
}
```

---

## Task 8: submitBugReportAction (server action)

**Files:**
- Create: `src/components/bugReport/submitBugReportAction.ts`
- Test: `src/components/bugReport/submitBugReportAction.test.ts`

**Step 1: Test** (mockt firestore, auth, Gmail; verifiziert Auth-Guard, `createdBy` aus Token, Mail-Conditional, `notificationError`-Fallback)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockDoc = vi.fn(() => ({ set: mockSet, get: mockGet, update: vi.fn() }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: any[]) => mockCollection(...args),
    FieldValue: {},
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}));

const actionUserRequiredMock = vi.fn();
vi.mock('../../app/auth', () => ({
  actionUserRequired: () => actionUserRequiredMock(),
}));

const sendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@googleapis/gmail', () => ({
  gmail: () => ({ users: { messages: { send: sendMock } } }),
}));
vi.mock('../../server/auth/workspace', () => ({
  createWorkspaceAuth: () => ({}),
}));

import { submitBugReportAction } from './submitBugReportAction';

const baseInput = {
  reportId: 'r1',
  kind: 'bug' as const,
  title: 'T', description: 'D',
  context: {
    url: 'u', pathname: '/', buildId: 'b', database: '', userAgent: 'UA',
    platform: 'web', isNative: false, viewport: { width: 1, height: 1 }, locale: 'de',
  },
  logs: [], screenshots: [], attachments: [],
};

describe('submitBugReportAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'uid1', email: 'me@ff-neusiedlamsee.at', name: 'Me' },
    });
    process.env.GOOGLE_SERVICE_ACCOUNT = 'sa';
    process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT = 'me@example.com';
    process.env.NEXTAUTH_URL = 'https://app';
  });

  it('calls auth guard and writes report with server-set createdBy', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ recipientEmails: ['a@x'], enabled: true }) });
    await submitBugReportAction({ ...baseInput, /* attacker-supplied: */ } as any);

    expect(actionUserRequiredMock).toHaveBeenCalled();
    const written = mockSet.mock.calls[0][0];
    expect(written.createdBy).toEqual({ uid: 'uid1', email: 'me@ff-neusiedlamsee.at', displayName: 'Me' });
    expect(written.status).toBe('open');
  });

  it('skips email when config disabled', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ recipientEmails: ['a@x'], enabled: false }) });
    await submitBugReportAction(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips email when no recipients', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ recipientEmails: [], enabled: true }) });
    await submitBugReportAction(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('writes notificationError on mail failure but does not throw', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ recipientEmails: ['a@x'], enabled: true }) });
    sendMock.mockRejectedValueOnce(new Error('SMTP down'));

    const updateMock = vi.fn().mockResolvedValue(undefined);
    mockDoc.mockReturnValueOnce({ set: mockSet, get: mockGet, update: updateMock });
    mockDoc.mockReturnValueOnce({ set: mockSet, get: mockGet, update: updateMock });

    await expect(submitBugReportAction(baseInput)).resolves.toEqual({ reportId: 'r1' });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ notificationError: 'SMTP down' }));
  });
});
```

**Step 2: FAIL.**

**Step 3: Implementation**

```ts
// submitBugReportAction.ts
'use server';
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { gmail } from '@googleapis/gmail';
import { actionUserRequired } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { createWorkspaceAuth } from '../../server/auth/workspace';
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  BUG_REPORT_MAX_LOG_ENTRIES,
  type BugReport,
  type BugReportConfig,
  type BugReportSubmitInput,
} from '../../common/bugReport';
import { buildBugReportEmail } from './buildBugReportEmail';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

interface SubmitResult { reportId: string }

export async function submitBugReportAction(
  input: BugReportSubmitInput,
): Promise<SubmitResult> {
  const session = await actionUserRequired();

  if (!input.title?.trim() || !input.description?.trim()) {
    throw new Error('Title and description required');
  }
  if (input.kind !== 'bug' && input.kind !== 'feature') {
    throw new Error('Invalid kind');
  }

  const createdBy = {
    uid: session.user.id,
    email: session.user.email ?? '',
    ...(session.user.name ? { displayName: session.user.name } : {}),
  };

  const data = {
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim(),
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
    createdBy,
    context: input.context,
    logs: (input.logs ?? []).slice(-BUG_REPORT_MAX_LOG_ENTRIES),
    screenshots: input.screenshots ?? [],
    attachments: input.attachments ?? [],
  };

  const docRef = firestore.collection(BUG_REPORT_COLLECTION).doc(input.reportId);
  await docRef.set(data);

  // Best-effort notification mail
  try {
    await sendNotification({ ...data, id: input.reportId } as unknown as BugReport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bug report notification failed:', err);
    try { await docRef.update({ notificationError: message }); } catch {}
  }

  return { reportId: input.reportId };
}

async function sendNotification(report: BugReport): Promise<void> {
  const configSnap = await firestore
    .collection(APP_CONFIG_COLLECTION)
    .doc(BUG_REPORT_CONFIG_DOC)
    .get();

  if (!configSnap.exists) return;
  const cfg = configSnap.data() as BugReportConfig;
  if (!cfg.enabled || !cfg.recipientEmails?.length) return;

  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT) {
    throw new Error('Email service not configured');
  }

  const from = process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT!;
  const [to, ...cc] = cfg.recipientEmails;
  const appBaseUrl = process.env.NEXTAUTH_URL ?? '';

  const { raw } = buildBugReportEmail({ report, appBaseUrl, from, to, cc });
  const encoded = Buffer.from(raw).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const auth = createWorkspaceAuth(GMAIL_SCOPES);
  const client = gmail({ version: 'v1', auth });
  await client.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}
```

---

## Task 9: bugReportAdminActions

**Files:**
- Create: `src/app/admin/bug-reports/bugReportAdminActions.ts`
- Test: `src/app/admin/bug-reports/bugReportAdminActions.test.ts`

**Test prüft pro Action**: `actionAdminRequired()` wird aufgerufen, korrekte Firestore-Args, `getDownloadURL` für Anhänge gemockt.

**Implementation** exportiert:

```ts
'use server';
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getDownloadURL } from 'firebase-admin/storage';
import { actionAdminRequired } from '../../auth';
import { firestore, getAdminStorage } from '../../../server/firebase/admin';
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  DEFAULT_BUG_REPORT_CONFIG,
  type BugReport,
  type BugReportConfig,
  type BugReportStatus,
} from '../../../common/bugReport';

export async function listBugReportsAction(): Promise<BugReport[]> {
  await actionAdminRequired();
  const snap = await firestore.collection(BUG_REPORT_COLLECTION)
    .orderBy('createdAt', 'desc').limit(500).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BugReport));
}

export async function getBugReportAction(id: string): Promise<{
  report: BugReport;
  screenshotUrls: string[];
  attachmentUrls: string[];
}> {
  await actionAdminRequired();
  const doc = await firestore.collection(BUG_REPORT_COLLECTION).doc(id).get();
  if (!doc.exists) throw new Error('Report not found');
  const report = { id: doc.id, ...doc.data() } as BugReport;
  const bucket = getAdminStorage().bucket();
  const sign = async (path: string) => {
    const file = bucket.file(path.replace(/^\//, ''));
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });
    return url;
  };
  const screenshotUrls = await Promise.all((report.screenshots ?? []).map(sign));
  const attachmentUrls = await Promise.all((report.attachments ?? []).map(sign));
  return { report, screenshotUrls, attachmentUrls };
}

export async function updateBugReportStatusAction(
  id: string, status: BugReportStatus,
): Promise<void> {
  const session = await actionAdminRequired();
  await firestore.collection(BUG_REPORT_COLLECTION).doc(id).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: {
      uid: session.user.id,
      email: session.user.email ?? '',
      ...(session.user.name ? { displayName: session.user.name } : {}),
    },
  });
}

export async function getBugReportConfigAction(): Promise<BugReportConfig> {
  await actionAdminRequired();
  const snap = await firestore.collection(APP_CONFIG_COLLECTION).doc(BUG_REPORT_CONFIG_DOC).get();
  if (!snap.exists) return DEFAULT_BUG_REPORT_CONFIG;
  return snap.data() as BugReportConfig;
}

export async function updateBugReportConfigAction(
  config: Pick<BugReportConfig, 'recipientEmails' | 'enabled'>,
): Promise<void> {
  const session = await actionAdminRequired();
  await firestore.collection(APP_CONFIG_COLLECTION).doc(BUG_REPORT_CONFIG_DOC).set({
    recipientEmails: config.recipientEmails ?? [],
    enabled: !!config.enabled,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: {
      uid: session.user.id,
      email: session.user.email ?? '',
      ...(session.user.name ? { displayName: session.user.name } : {}),
    },
  }, { merge: true });
}
```

**Hinweise:**
- Vor Implementierung prüfen, ob `getAdminStorage` aus `src/server/firebase/admin.ts` existiert — wenn nicht, dort `export function getAdminStorage()` mit `getStorage(adminApp)` ergänzen oder die schon vorhandene Storage-Instanz importieren. Falls eine andere Bucket-Name-Auflösung üblich ist (z.B. via env), den vorhandenen Code aus `src/server/` als Referenz nutzen.
- `getDownloadURL` aus `firebase-admin/storage` ist ein Helper — alternativ `bucket.file(...).getSignedUrl(...)` wie oben verwendet.

---

## Task 10: BugReportDialog

**Files:**
- Create: `src/components/bugReport/BugReportDialog.tsx`
- Test: `src/components/bugReport/BugReportDialog.test.tsx`

Komponente nimmt `open: boolean`, `onClose: () => void` als Props. Eigene Form-State (Titel/Beschreibung/Kind/Anhänge). Beim Open wird `logs = useDebugLogging().messages.slice(-200)` und `context = collectContext(...)` eingefroren.

**Render-Plan:**

1. `<Dialog open fullWidth maxWidth="sm">` — `sx={{ display: minimized ? 'none' : 'flex' }}` (zum Verstecken beim Screenshot).
2. `<DialogTitle>` mit Bug-Icon und Text "Feedback / Bug melden".
3. `<DialogContent>`:
   - `<ToggleButtonGroup>` (`kind`: Bug | Feature Request).
   - Wenn `kind === 'bug' && !displayMessages`: `<Alert severity="info">` mit Text + `<Switch>` "Debug-Logging aktivieren" → wirkt auf `setDisplayMessages(true)`.
   - Wenn `kind === 'bug' && displayMessages`: `<Alert severity="success">`: "Debug-Logging ist aktiv".
   - `<TextField label="Titel" required>` (autofocus).
   - `<TextField label="Beschreibung" required multiline minRows={4}>`.
   - **Anhänge-Sektion**:
     - Button "Bildschirmaufnahme machen" (nur wenn `isScreenshotSupported()`). Klick → `setMinimized(true)` → `await captureScreenshot()` → `setMinimized(false)` → Blob zu `attachments` hinzufügen.
     - Button "Bilder hinzufügen" mit verstecktem `<input type="file" accept="image/*" multiple capture="environment">`.
     - Thumbnail-Liste mit Remove-Buttons (object-URLs).
   - `<Accordion>` "Erfasste Kontextdaten" — zeigt URL, Build, Plattform, Firecall, Log-Anzahl, Liste (read-only `<pre>`).
4. `<DialogActions>`: Abbrechen + Senden.
5. Submit-Logik:
   - `submitting = true`.
   - `reportId = uuid()`.
   - `Promise.allSettled` aller `uploadBugReportFile(reportId, blob, filename, type)`.
   - Trenne ersten "screenshot"-Eintrag → `screenshots[]`, restliche → `attachments[]`. (Mehrere Screenshots möglich; Heuristik: bei Aufnahme via API geht der Blob in `screenshots[]`, alle File-Inputs in `attachments[]`.) → Wir trennen die beiden Arrays bereits clientseitig: `pendingScreenshots: Blob[]`, `pendingAttachments: File[]`.
   - `await submitBugReportAction({ reportId, kind, title, description, context, logs, screenshots, attachments })`.
   - Erfolg → `useSnackbar()('Danke! Dein Report wurde gesendet.', 'success')` + onClose + Form-Reset.
   - Fehler → `useSnackbar()('Senden fehlgeschlagen', 'error', { label: 'Nochmal', onClick: submit })`.

**Tests (jsdom + Testing Library)** decken ab:
- Pflichtfeld-Validierung (Senden disabled ohne Titel/Beschreibung).
- ToggleButtonGroup wechselt Kind.
- Hinweis-Switch ruft `setDisplayMessages(true)` (Provider gemockt).
- Screenshot-Button nicht gerendert wenn `isScreenshotSupported() === false`.
- Submit ruft `uploadBugReportFile` für jeden Anhang und `submitBugReportAction` mit erwarteter Payload (alles gemockt).

---

## Task 11: BugReportProvider

**Files:**
- Create: `src/components/bugReport/BugReportProvider.tsx`
- Test: `src/components/bugReport/BugReportProvider.test.tsx`

Einfacher Provider mit Open-State + Hook:

```ts
const BugReportContext = createContext<{ open: () => void }>({ open: () => {} });
export const useBugReport = () => useContext(BugReportContext);

export default function BugReportProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <BugReportContext.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      <BugReportDialog open={isOpen} onClose={() => setIsOpen(false)} />
    </BugReportContext.Provider>
  );
}
```

Test rendert Provider + Konsument-Komponente, klickt Open-Button, prüft dass Dialog gerendert wird (via gemocktem BugReportDialog).

---

## Task 12: AppProviders einbinden

**Files:**
- Modify: `src/components/providers/AppProviders.tsx`

Innerhalb `LogedinApp`, **innerhalb** des `DebugLoggingProvider` (damit der Dialog auf den Buffer zugreifen kann), `<BugReportProvider>` neu hinzufügen:

```tsx
<DebugLoggingProvider>
  <BugReportProvider>
    <MapEditorProvider>
      ...
    </MapEditorProvider>
  </BugReportProvider>
</DebugLoggingProvider>
```

Import via `dynamic(() => import('../bugReport/BugReportProvider'), { ssr: false })` analog zu den anderen dynamischen Providern.

---

## Task 13: Drawer-Eintrag

**Files:**
- Modify: `src/components/site/AppDrawer.tsx`

1. Neuen Import: `import BugReportIcon from '@mui/icons-material/BugReport';` und Hook-Import: `import { useBugReport } from '../bugReport/BugReportProvider';`.
2. Im `AppDrawer`-Body: `const bugReport = useBugReport();`.
3. **Vor** `Dokumentation`-Eintrag einen neuen Drawer-Eintrag einfügen, der einen `onClick`-Handler anstelle einer Route hat. Da das bisherige `drawerItems`-Schema `href` voraussetzt, eine Erweiterung minimieren:
   - Eintrag mit `href: '#'` UND optionalem `onClick`-Feld in der Item-Definition.
   - Im Render-Block (Zeile ~228): wenn `item.onClick`, `<ListItemButton onClick={() => { item.onClick(); setIsOpen(false); }}>` statt `<Link>`.
4. Eintrag: `{ text: 'Feedback / Bug melden', icon: <BugReportIcon />, href: '#', onClick: () => bugReport.open() }`.

---

## Task 14: Admin-Liste Server-Page

**Files:**
- Create: `src/app/admin/bug-reports/page.tsx`

Server-Komponente:

```tsx
import { listBugReportsAction, getBugReportConfigAction } from './bugReportAdminActions';
import BugReportListClient from './BugReportListClient';

export default async function BugReportsAdminPage() {
  const [reports, config] = await Promise.all([
    listBugReportsAction(),
    getBugReportConfigAction(),
  ]);
  return <BugReportListClient initialReports={reports} initialConfig={config} />;
}
```

Layout-Inheritance: `src/app/admin/layout.tsx` ist bereits Admin-Guard (prüfen — sonst innerhalb der Page nochmal `actionAdminRequired()`-Schutz greift via Server Actions).

---

## Task 15: BugReportListClient

**Files:**
- Create: `src/app/admin/bug-reports/BugReportListClient.tsx`

`'use client'`. Tabelle (`@mui/material/Table` oder `@mui/x-data-grid` falls schon im Projekt — prüfen via `grep DataGrid src/`). MVP: schlichte `<Table>`.

Spalten: Datum, Typ-Chip, Titel, User, Status-Chip, Anhänge, Build. Filter oberhalb: `<Select>` Typ, `<Select>` Status, `<TextField>` Suche.

Konfig-Section oben über der Tabelle via `<BugReportConfigSection initialConfig={initialConfig} />`.

Klick auf Reihe → öffnet `<BugReportDetailDialog reportId={…} />` modal.

---

## Task 16: BugReportDetailDialog

**Files:**
- Create: `src/app/admin/bug-reports/BugReportDetailDialog.tsx`

`'use client'`. Beim Open lädt via `getBugReportAction(id)`. Zeigt Metadaten, Beschreibung, Logs (kollabierbar), Bilder-Galerie (Lightbox optional weglassen — einfache `<img>`-Liste reicht), Status-Dropdown `<Select>` → `updateBugReportStatusAction(id, status)` mit Snackbar.

---

## Task 17: BugReportConfigSection

**Files:**
- Create: `src/app/admin/bug-reports/BugReportConfigSection.tsx`

`'use client'`. `<Box>` mit Switch "Notifications enabled" + Chip-Input für E-Mails (`@mui/material/Autocomplete freeSolo multiple`). Speichern-Button → `updateBugReportConfigAction({ enabled, recipientEmails })` + Snackbar.

---

## Task 18: Final Checks + Single Commit

**Step 1: Lokal alle Checks ausführen (Reihenfolge wie in CLAUDE.md):**

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map
npx tsc --noEmit
npx eslint
npx vitest run
npx next build --webpack
```

Erwartet: alle vier Schritte ohne Errors **und** ohne neue Warnings durchlaufen. Fehler werden direkt behoben, bevor zum nächsten Schritt übergegangen wird. `tsc`-Fehler dürfen niemals ignoriert werden.

**Step 2: `next-env.d.ts` zurücksetzen** (CLAUDE.md):

```bash
git checkout -- next-env.d.ts
```

**Step 3: Stagen & einmaliger Commit** (keine unrelated Files wie `package-lock.json` einschließen):

```bash
git add src/common/bugReport.ts \
        src/components/bugReport/ \
        src/app/admin/bug-reports/ \
        src/components/providers/AppProviders.tsx \
        src/components/site/AppDrawer.tsx \
        firebase/prod/firestore.rules \
        firebase/dev/firestore.rules \
        storage.rules

git commit -m "feat(bug-report): in-app bug and feature reports with admin UI

- Globaler BugReportProvider mit Dialog (Drawer-Eintrag) ohne Routenwechsel
- Screenshot via navigator.mediaDevices.getDisplayMedia (kein NPM-Paket)
- Auto-Capture: App-Metadaten + Debug-Message-Buffer Snapshot
- Server Action mit Auth-Guard, createdBy aus Token, best-effort Gmail-Notification
- Admin-UI unter /admin/bug-reports: Liste, Detail, Status, Empfaenger-Config
- Firestore-Rules fuer /bugReport (create authorized, read/update admin), /appConfig server-only
- Storage-Rules fuer /bugReports/{id}/{file}"
```

---

## Out-of-Scope (MVP)

- Console-Log-Interceptor, Network-Request-Capture, Service-Worker-Logs.
- Auto-Screenshot ohne User-Geste (DOM-Renderer wie html2canvas).
- Push-Notifications an Admins.
- Admin-Kommentare auf Reports, Bulk-Aktionen, CSV-Export.
- Auto-Bug-Report aus Error-Boundary (`global-error.tsx`).
- Versionierung des Reports / Audit-Trail über Status-Wechsel hinaus.
