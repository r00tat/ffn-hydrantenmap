'use server';
import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { actionAdminRequired } from '../../app/auth';
import {
  FAHRTENBUCH_COLLECTION_ID,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  appendMangelNote,
  applyMangelStatus,
  buildMangelDocument,
  sanitizeMangelImages,
  type Mangel,
  type MangelActor,
  type MangelStatus,
} from '../../common/mangel';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { actionErrorKey } from './actionErrorKey';
import { actionGroupMemberRequired, assertFahrtenbuchGroup } from './authGuards';
import { deleteMangelImages, signMangelImages } from './mangelImageStore';
import {
  entriesRef,
  loadMangel,
  mangelRef,
  refreshVehicleCache,
  vehicleRef,
} from './mangelStore';

export interface MangelActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

/**
 * Beschreibung für einen übernommenen Defekt, der weder Mangeltext noch
 * Hinweise trägt. Einträge aus der Zeit vor dem eigenen Mangelfeld haben oft
 * nur das Häkchen — das ist die Aussage, und sie darf nicht verloren gehen,
 * bloß weil niemand einen Text dazugeschrieben hat.
 */
const MIGRATED_WITHOUT_TEXT = 'Defekt gemeldet (ohne Beschreibung)';

async function loadVehicle(
  groupId: string,
  vehicleId: string,
): Promise<FahrtenbuchVehicle> {
  const doc = await vehicleRef(groupId, vehicleId).get();
  if (!doc.exists) {
    throw new Error(`vehicle ${vehicleId} not found in group ${groupId}`);
  }
  return { id: doc.id, ...doc.data() } as FahrtenbuchVehicle;
}

function actorFrom(session: {
  user: { id: string; name?: string | null; email?: string | null };
}): MangelActor {
  return {
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? '',
    now: new Date().toISOString(),
  };
}

export interface CreateMangelInput {
  vehicleId: string;
  description: string;
  /** Bereits hochgeladene Bilder als Storage-Pfade. */
  images?: string[];
}

/**
 * Meldet einen Mangel direkt am Fahrzeug — ohne Fahrt. Der Fall der monatlichen
 * Überprüfung, für den es bisher keinen Weg gab außer einer Alibi-Fahrt.
 *
 * Status und Melder kommen bewusst nicht aus der Eingabe: Ein neu gemeldeter
 * Mangel ist offen, sonst ließe er sich als bereits behoben anlegen.
 */
export async function createMangel(
  groupId: string,
  input: CreateMangelInput,
): Promise<MangelActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const vehicle = await loadVehicle(groupId, input.vehicleId);

    const doc = buildMangelDocument(
      {
        vehicleId: input.vehicleId,
        description: input.description,
        images: input.images,
      },
      vehicle,
      groupId,
      actorFrom(session),
    );

    const ref = await mangelRef(groupId).add(doc);
    await refreshVehicleCache(groupId, input.vehicleId);
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('createMangel failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface UpdateMangelInput {
  description: string;
  /**
   * Die vollständige Bilderliste nach der Bearbeitung, nicht die neu
   * hinzugekommenen. Was hier fehlt, wird aus dem Storage gelöscht — ohne das
   * bliebe jedes im Dialog entfernte Bild als bezahlte Datei liegen.
   * Nicht angegeben heißt „unverändert".
   */
  images?: string[];
}

/**
 * Korrigiert die Beschreibung und die Bilderliste. Verlauf und Status bleiben
 * unangetastet — ein Tippfehler in der Beschreibung ist kein Vorgang, der in
 * den Verlauf gehört.
 */
export async function updateMangel(
  groupId: string,
  mangelId: string,
  input: UpdateMangelInput,
): Promise<MangelActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const mangel = await loadMangel(groupId, mangelId);
    const description = input.description?.trim() ?? '';
    if (!description) {
      throw new Error('invalid mangel: descriptionMissing');
    }

    const actor = actorFrom(session);
    const patch: Record<string, unknown> = {
      description,
      updatedAt: actor.now,
      updatedBy: actor.userId,
    };

    // Der Pfad kommt aus dem Browser: erst gegen die eigene Gruppe prüfen,
    // dann speichern. Sonst zeigte ein Mangel auf die Dateien einer fremden
    // Gruppe und die Anzeige signierte sie bereitwillig.
    let removed: string[] = [];
    if (input.images !== undefined) {
      const images = sanitizeMangelImages(input.images, groupId);
      const previous = sanitizeMangelImages(mangel.images, groupId);
      removed = previous.filter((path) => !images.includes(path));
      patch.images = images;
    }

    await mangelRef(groupId).doc(mangelId).set(patch, { merge: true });
    // Erst nach dem Schreiben: Scheitert das Speichern, zeigt das Dokument
    // weiterhin auf Dateien, die es noch gibt.
    if (removed.length > 0) await deleteMangelImages(removed);
    await refreshVehicleCache(groupId, mangel.vehicleId);
    return { success: true, id: mangelId };
  } catch (err) {
    console.error('updateMangel failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface MangelImageUrl {
  /** Der Storage-Pfad, wie er am Dokument steht. */
  path: string;
  /** Kurzlebige Lese-URL zu genau diesem Pfad. */
  url: string;
}

export interface MangelImageUrlsResult {
  success: boolean;
  error?: string;
  /**
   * Pfad und URL als Paar statt zweier Listen: Der Aufrufer entfernt einzelne
   * Bilder und darf dabei nicht auf gleiche Reihenfolge angewiesen sein.
   */
  images?: MangelImageUrl[];
}

/**
 * Kurzlebige Lese-URLs zu den Bildern eines Mangels.
 *
 * Der Weg über den Server statt über die `storage.rules`: Lesen darf, wer in
 * der Gruppe ist — eine Bedingung, die in Firestore steht und die eine
 * Storage-Regel nur über die Default-Datenbank prüfen könnte. In der
 * Dev-Datenbank `ffndev` wäre die Antwort dann falsch. Deshalb verweigern die
 * Regeln jedem Client das Lesen und diese Action gibt signierte URLs heraus.
 */
export async function mangelImageUrls(
  groupId: string,
  mangelId: string,
): Promise<MangelImageUrlsResult> {
  try {
    await actionGroupMemberRequired(groupId);
    const mangel = await loadMangel(groupId, mangelId);
    const paths = sanitizeMangelImages(mangel.images, groupId);
    const urls = await signMangelImages(paths);
    return {
      success: true,
      images: paths.map((path, index) => ({ path, url: urls[index] })),
    };
  } catch (err) {
    console.error('mangelImageUrls failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface ChangeMangelStatusOptions {
  /** Notiz, die den Statuswechsel begleitet. */
  note?: string;
  /** Korrigiertes Behebungsdatum; ohne Angabe „jetzt". */
  resolvedAt?: string;
}

/**
 * Setzt den Status und schreibt den Statuswechsel in den Verlauf.
 *
 * Jedes Gruppenmitglied darf das — nicht nur der Melder: Wer den Mangel
 * abarbeitet, ist selten der, der ihn bemerkt hat. Nachvollziehbar bleibt es
 * über den Verlauf, der Autor und Zeitpunkt jeder Änderung trägt.
 */
export async function changeMangelStatus(
  groupId: string,
  mangelId: string,
  status: MangelStatus,
  options: ChangeMangelStatusOptions = {},
): Promise<MangelActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const mangel = await loadMangel(groupId, mangelId);
    const patch = applyMangelStatus(mangel, status, actorFrom(session), options);

    // `null` ist das Löschsignal aus `applyMangelStatus`. Bei `merge: true`
    // ließe ein weggelassenes Feld das alte Behebungsdatum stehen — ein wieder
    // geöffneter Mangel behielte es dann.
    const { resolvedAt, ...rest } = patch;
    await mangelRef(groupId)
      .doc(mangelId)
      .set(
        resolvedAt === undefined
          ? rest
          : {
              ...rest,
              resolvedAt: resolvedAt === null ? FieldValue.delete() : resolvedAt,
            },
        { merge: true },
      );
    await refreshVehicleCache(groupId, mangel.vehicleId);
    return { success: true, id: mangelId };
  } catch (err) {
    console.error('changeMangelStatus failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/** Hängt eine Notiz an den Verlauf an, ohne den Status zu berühren. */
export async function addMangelNote(
  groupId: string,
  mangelId: string,
  text: string,
): Promise<MangelActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const mangel = await loadMangel(groupId, mangelId);
    const patch = appendMangelNote(mangel, text, actorFrom(session));

    await mangelRef(groupId).doc(mangelId).set(patch, { merge: true });
    return { success: true, id: mangelId };
  } catch (err) {
    console.error('addMangelNote failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/**
 * Löscht einen Mangel endgültig — nur für Admins.
 *
 * Anders als eine Fahrt ist ein Mangel kein Nachweisdokument, sondern eine
 * Arbeitsaufgabe. Ein versehentlich am falschen Fahrzeug angelegter Mangel
 * gehört weg und nicht auf „behoben" gesetzt: Sonst stünde im Verlauf, er sei
 * repariert worden.
 */
export async function deleteMangel(
  groupId: string,
  mangelId: string,
): Promise<MangelActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    if (!session.user.isAdmin) {
      return { success: false, error: 'notAllowedDelete' };
    }
    const mangel = await loadMangel(groupId, mangelId);

    await mangelRef(groupId).doc(mangelId).delete();
    // Nach dem Löschen des Dokuments: Der Datensatz ist der Vorgang, die
    // Dateien sind seine Anhänge. Umgekehrt bliebe bei einem Fehler ein Mangel
    // stehen, dessen Bilder schon weg sind.
    await deleteMangelImages(sanitizeMangelImages(mangel.images, groupId));
    await refreshVehicleCache(groupId, mangel.vehicleId);
    return { success: true, id: mangelId };
  } catch (err) {
    console.error('deleteMangel failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface MigrateDefectsResult {
  success: boolean;
  /** Neu angelegte Mängel. */
  created: number;
  /** Fahrten, zu denen schon ein Mangel bestand. */
  skipped: number;
  error?: string;
}

/**
 * Übernimmt Defekte aus bestehenden Fahrten als Mängel.
 *
 * Idempotent über `entryId`: Ein zweiter Lauf legt nichts doppelt an. Ohne
 * diese Übernahme wären alle bisher gemeldeten Defekte in der neuen Übersicht
 * unsichtbar — sie stünden nur an ihrer Fahrt und tauchten nirgends als offene
 * Aufgabe auf.
 *
 * Der Mangel bekommt Zeitpunkt und Melder der Fahrt, nicht der Migration: Ein
 * Defekt von vor einem halben Jahr ist ein halbes Jahr alt.
 */
export async function migrateDefectsToMangel(
  groupId: string,
): Promise<MigrateDefectsResult> {
  try {
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
    const actor = actorFrom(session);

    const [entrySnapshot, mangelSnapshot] = await Promise.all([
      entriesRef(groupId)
        .where('defekt', '==', true)
        .where('deleted', '==', false)
        .get(),
      mangelRef(groupId).get(),
    ]);

    const covered = new Set(
      mangelSnapshot.docs
        .map((doc) => (doc.data() as Mangel).entryId)
        .filter((id): id is string => !!id),
    );

    let created = 0;
    let skipped = 0;
    const touchedVehicles = new Set<string>();
    // Ein Firestore-Batch fasst 500 Schreibvorgänge; 200 lässt Luft.
    const CHUNK = 200;
    let batch = firestore.batch();
    let inBatch = 0;

    for (const doc of entrySnapshot.docs) {
      const entry = doc.data() as FahrtenbuchEntry;
      if (covered.has(doc.id)) {
        skipped += 1;
        continue;
      }

      const mangel = buildMangelDocument(
        {
          vehicleId: entry.vehicleId,
          // Reihenfolge nach Aussagekraft: der eigene Mangeltext, sonst die
          // Hinweise (dort stand die Beschreibung vor dem eigenen Feld),
          // sonst der Vermerk, dass es keine gibt.
          description:
            entry.mangel?.trim() ||
            entry.hinweise?.trim() ||
            MIGRATED_WITHOUT_TEXT,
          entryId: doc.id,
          reportedAt: entry.abfahrt,
          reportedBy: entry.createdBy,
          reportedByName: entry.driverName,
        },
        { name: entry.vehicleName },
        groupId,
        actor,
      );

      batch.set(mangelRef(groupId).doc(), mangel);
      created += 1;
      inBatch += 1;
      touchedVehicles.add(entry.vehicleId);

      if (inBatch >= CHUNK) {
        await batch.commit();
        batch = firestore.batch();
        inBatch = 0;
      }
    }

    if (inBatch > 0) await batch.commit();

    // Erst am Ende, sonst zählte jeder Block neu. Ein Fehler hier darf die
    // Übernahme nicht als gescheitert melden: Die Mängel stehen bereits, der
    // Zähler ist ein abgeleiteter Wert.
    for (const vehicleId of touchedVehicles) {
      try {
        await refreshVehicleCache(groupId, vehicleId);
      } catch (err) {
        console.error('migrateDefectsToMangel: Cache nicht aufgefrischt', err, {
          groupId,
          vehicleId,
        });
      }
    }

    return { success: true, created, skipped };
  } catch (err) {
    console.error('migrateDefectsToMangel failed', err);
    return {
      success: false,
      created: 0,
      skipped: 0,
      error: actionErrorKey(err),
    };
  }
}
