'use server';
import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { getTranslations } from 'next-intl/server';
import { APP_CONFIG_COLLECTION } from '../../../common/bugReport';
import type { FirebaseUserInfo } from '../../../common/users';
import { USER_COLLECTION_ID } from '../../../components/firebase/firestore';
import {
  recomputeUserPermissions,
  writeUserRoles,
} from '../../../server/auth/userRoles';
import { userSessionCache } from '../../../server/auth/userSessionCache';
import { firebaseAuth, firestore } from '../../../server/firebase/admin';
import { setCustomClaimsForUser } from '../../api/users/[uid]/updateUser';
import { actionAdminRequired } from '../../auth';
import {
  buildMigrationPreview,
  checkPermissionFields,
  isMigrated,
  legacyCleanupStatus,
  migrationGroupRoles,
  MIGRATION_LOG_LIST_LIMIT,
  PERMISSIONS_MIGRATION_DOC,
  planLegacyCleanup,
  type LegacyCleanupStatus,
  type MigrationStepError,
  type MigrationStepResult,
  type MigrationUserRecord,
  type PermissionsMigrationLog,
  type RecomputeDeviation,
  type RecomputeResult,
  type UserMigrationPreview,
} from './permissionsMigration';

/**
 * Server Actions der Seite `/admin/berechtigungen`. Jeder Schritt ist einzeln
 * auslösbar und idempotent; was geschrieben wird, entscheidet die reine Logik
 * in `permissionsMigration.ts`. Hintergrund: docs/berechtigungen.md.
 */

export interface PermissionsMigrationState {
  users: UserMigrationPreview[];
  cleanup: LegacyCleanupStatus;
  log: PermissionsMigrationLog;
}

/** Gleichzeitige Schreibvorgänge: genug für Sekunden, wenig genug für Firestore. */
const CONCURRENCY = 10;

interface AuthInfo {
  email?: string;
  displayName?: string;
}

async function listAuthUsers(): Promise<Map<string, AuthInfo>> {
  const result = new Map<string, AuthInfo>();
  let pageToken: string | undefined;
  do {
    const page = await firebaseAuth.listUsers(1000, pageToken);
    for (const u of page.users) {
      result.set(u.uid, { email: u.email, displayName: u.displayName });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return result;
}

interface LoadedUsers {
  users: (MigrationUserRecord & FirebaseUserInfo)[];
  authUids: Set<string>;
}

/**
 * Die Benutzerdokumente sind die Quelle (dort stehen die Rollen); aus Firebase
 * Auth kommen nur E-Mail und Name für die Anzeige.
 */
async function loadUsers(): Promise<LoadedUsers> {
  const [snapshot, auth] = await Promise.all([
    firestore.collection(USER_COLLECTION_ID).get(),
    listAuthUsers(),
  ]);
  const users = snapshot.docs.map((doc) => {
    const data = doc.data() as FirebaseUserInfo & {
      email?: string;
      displayName?: string;
    };
    const info = auth.get(doc.id);
    return {
      ...data,
      uid: doc.id,
      email: info?.email ?? data.email,
      displayName: data.displayName || info?.displayName,
    };
  });
  return { users, authUids: new Set(auth.keys()) };
}

async function forEachLimited<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stepResult(
  by: string,
  processed: number,
  skipped: number,
  errors: MigrationStepError[],
): MigrationStepResult {
  return {
    at: new Date().toISOString(),
    by,
    processed,
    skipped,
    errors: errors.slice(0, MIGRATION_LOG_LIST_LIMIT),
  };
}

function migrationLogRef() {
  return firestore
    .collection(APP_CONFIG_COLLECTION)
    .doc(PERMISSIONS_MIGRATION_DOC);
}

async function readLog(): Promise<PermissionsMigrationLog> {
  const snapshot = await migrationLogRef().get();
  return (snapshot.exists ? snapshot.data() : {}) as PermissionsMigrationLog;
}

async function writeLog<K extends keyof PermissionsMigrationLog>(
  step: K,
  result: NonNullable<PermissionsMigrationLog[K]>,
) {
  // Je Schritt ein Feld: der letzte Lauf eines Schritts ersetzt seinen
  // Vorgänger, die anderen Schritte bleiben stehen.
  await migrationLogRef().set({ [step]: result }, { merge: true });
}

/** Schritt 1: Vorschau (Trockenlauf) und Stand der Migration. */
export async function getPermissionsMigrationState(): Promise<PermissionsMigrationState> {
  await actionAdminRequired();
  const [{ users }, log] = await Promise.all([loadUsers(), readLog()]);
  return {
    users: buildMigrationPreview(users),
    cleanup: legacyCleanupStatus(users),
    log,
  };
}

/**
 * Schritt 2: `groupRoles` und die Ableitung für jeden noch nicht migrierten
 * Benutzer schreiben. Alte Felder und Claims bleiben unverändert, damit ein
 * Rollback auf das vorige Release ohne Datenreparatur geht.
 *
 * @param kostenersatzSelection je UID die Gruppen mit Kostenersatz-Häkchen;
 *   fehlt ein Benutzer, gilt die Vorbelegung (alle Mitgliedsgruppen).
 */
export async function migrateUserRoles(
  kostenersatzSelection: Record<string, string[]> = {},
): Promise<MigrationStepResult> {
  const session = await actionAdminRequired();
  const selection =
    kostenersatzSelection && typeof kostenersatzSelection === 'object'
      ? kostenersatzSelection
      : {};

  const { users } = await loadUsers();
  const pending = users.filter((user) => !isMigrated(user));
  const errors: MigrationStepError[] = [];
  let processed = 0;

  await forEachLimited(pending, async (user) => {
    try {
      const choice = Object.prototype.hasOwnProperty.call(selection, user.uid)
        ? selection[user.uid]
        : undefined;
      await writeUserRoles(user.uid, {
        kind: 'replaceAll',
        groupRoles: migrationGroupRoles(user, choice),
      });
      processed++;
    } catch (err) {
      console.error(`permissions migration: ${user.uid} failed`, err);
      errors.push({ uid: user.uid, message: errorMessage(err) });
    }
  });

  const result = stepResult(
    session.user.email ?? session.user.id,
    processed,
    users.length - pending.length,
    errors,
  );
  await writeLog('migrate', result);
  console.info(
    `permissions migration: ${processed} migrated, ${result.skipped} skipped, ${errors.length} errors`,
  );
  return result;
}

/**
 * Schritt 3: alte Rollenfelder und `'kostenersatz'` aus `groups` löschen und
 * die Claims aus `groupRoles` neu setzen. Danach geht ein Rollback nicht mehr
 * ohne Weiteres — deshalb nur, wenn alle Benutzer migriert sind.
 */
export async function removeLegacyRoleFields(): Promise<MigrationStepResult> {
  const session = await actionAdminRequired();
  const t = await getTranslations('adminPermissions');

  const { users, authUids } = await loadUsers();
  // Am Bestand prüfen, nicht an der Vorschau des Browsers: Seit dem Laden der
  // Seite kann ein Benutzer ohne `groupRoles` dazugekommen sein.
  if (!legacyCleanupStatus(users).allowed) {
    throw new Error(t('cleanupNotAllowed'));
  }

  const errors: MigrationStepError[] = [];
  let processed = 0;

  await forEachLimited(users, async (user) => {
    const plan = planLegacyCleanup(user);
    const hasAuth = authUids.has(user.uid);
    if (!plan.changed && !hasAuth) return;
    try {
      if (plan.changed) {
        await firestore
          .collection(USER_COLLECTION_ID)
          .doc(user.uid)
          .update({
            ...Object.fromEntries(
              plan.removeFields.map((field) => [field, FieldValue.delete()]),
            ),
            ...(plan.groups ? { groups: plan.groups } : {}),
          });
      }
      // Ein Benutzerdokument ohne Auth-Konto hat keine Claims.
      if (hasAuth) {
        await setCustomClaimsForUser(user.uid, {
          groups: plan.claimGroups,
          isAdmin: !!user.isAdmin,
          authorized: !!user.authorized,
          ...(user.firecall
            ? {
                firecall: user.firecall,
                firecallWrite: user.firecallWrite !== false,
                firecallExpires: user.firecallExpiresAt,
              }
            : {}),
        });
      }
      userSessionCache.invalidate(user.uid);
      processed++;
    } catch (err) {
      console.error(`permissions cleanup: ${user.uid} failed`, err);
      errors.push({ uid: user.uid, message: errorMessage(err) });
    }
  });

  const result = stepResult(
    session.user.email ?? session.user.id,
    processed,
    users.length - processed - errors.length,
    errors,
  );
  await writeLog('cleanup', result);
  console.info(
    `permissions cleanup: ${processed} users updated, ${errors.length} errors`,
  );
  return result;
}

/**
 * „Rechte neu ableiten": `groupPerms`/`permsAny` aller migrierten Benutzer aus
 * `groupRoles` und dem aktuellen Katalog. Der Abgleich vorher meldet, wo die
 * Firestore-Regeln etwas anderes gesehen haben als Server und Client — auch
 * der Weg nach jeder Katalogänderung.
 */
export async function recomputeAllPermissions(): Promise<RecomputeResult> {
  const session = await actionAdminRequired();
  const { users } = await loadUsers();

  const deviations: RecomputeDeviation[] = [];
  const errors: MigrationStepError[] = [];
  let notMigrated = 0;
  let processed = 0;

  const migrated = users.filter((user) => {
    if (isMigrated(user)) return true;
    notMigrated++;
    return false;
  });

  await forEachLimited(migrated, async (user) => {
    const found = checkPermissionFields(user);
    if (found.length > 0) {
      deviations.push({
        uid: user.uid,
        label: user.displayName || user.email || user.uid,
        deviations: found,
      });
    }
    try {
      if (await recomputeUserPermissions(user.uid)) processed++;
    } catch (err) {
      console.error(`permissions recompute: ${user.uid} failed`, err);
      errors.push({ uid: user.uid, message: errorMessage(err) });
    }
  });

  deviations.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  const result: RecomputeResult = {
    ...stepResult(
      session.user.email ?? session.user.id,
      processed,
      migrated.length - processed - errors.length,
      errors,
    ),
    deviations: deviations.slice(0, MIGRATION_LOG_LIST_LIMIT),
    notMigrated,
  };
  await writeLog('recompute', result);
  console.info(
    `permissions recompute: ${processed} changed, ${deviations.length} deviations, ${notMigrated} not migrated`,
  );
  return result;
}
