/**
 * Mängel an Fahrzeugen — eigener Vorgang mit Lebenszyklus.
 *
 * Bewusst nicht als Felder am Fahrtenbuch-Eintrag: Der ist ein
 * Nachweisdokument, das nur sein Ersteller (oder ein Admin) ändern darf, und
 * `updateFahrtenbuchEntry` baut es bei jeder Bearbeitung komplett neu auf. Ein
 * Statuswechsel schriebe damit den ganzen Nachweis um — und der
 * Fahrzeugverantwortliche, der den Mangel abarbeitet, ist selten der Fahrer,
 * der ihn gemeldet hat. Ein Mangel, der bei einer Überprüfung und nicht auf
 * einer Fahrt auffällt, wäre dort außerdem gar nicht abbildbar.
 */

/** Subcollection unter groups/{groupId} — wie `fahrtenbuch` und `vehicle`. */
export const FAHRTENBUCH_MANGEL_COLLECTION_ID = 'mangel';

export type MangelStatus = 'open' | 'inProgress' | 'resolved';

export const MANGEL_STATUSES: MangelStatus[] = [
  'open',
  'inProgress',
  'resolved',
];

/** Was noch Arbeit macht — die Grundlage des Zählers auf der Fahrzeugkarte. */
export const OPEN_MANGEL_STATUSES: MangelStatus[] = ['open', 'inProgress'];

/**
 * Ein Eintrag im Verlauf. Append-only: Was einmal notiert wurde, bleibt stehen.
 * Der Verlauf einer Reparatur („Werkstatttermin 12.8.", „Ersatzteil bestellt")
 * ist genau das, was ein einzelnes überschreibbares Notizfeld verlöre.
 */
export interface MangelNote {
  /** Leer erlaubt, wenn `status` gesetzt ist — ein reiner Statuswechsel. */
  text: string;
  /** Gesetzt, wenn diese Notiz einen Statuswechsel begleitet. */
  status?: MangelStatus;
  at: string;
  by: string;
  byName: string;
}

export interface Mangel {
  id?: string;
  vehicleId: string;
  /**
   * Kopie des Fahrzeugnamens. Die gruppenweite Mängelliste soll ohne einen
   * Join über alle Fahrzeuge lesbar sein — dieselbe Bauweise wie
   * `FahrtenbuchEntry.vehicleName`.
   */
  vehicleName: string;
  /** Die meldende Fahrt; fehlt bei direkt am Fahrzeug gemeldeten Mängeln. */
  entryId?: string;
  description: string;
  status: MangelStatus;
  /**
   * Nur bei `status === 'resolved'`. Wird beim Wiederöffnen entfernt — sonst
   * behauptete ein offener Mangel ein Behebungsdatum.
   */
  resolvedAt?: string;
  notes: MangelNote[];
  /**
   * Wann der Mangel bemerkt wurde. Bei einem Mangel aus einer Fahrt die
   * Abfahrt dieser Fahrt und nicht der Zeitpunkt des Schreibens: Eine
   * nachgetragene Fahrt von vorletzter Woche meldet einen Mangel von
   * vorletzter Woche.
   */
  reportedAt: string;
  reportedBy: string;
  reportedByName: string;
  /**
   * Storage-Pfade der Bilder (`fullPath`), nicht deren URLs. Eine Download-URL
   * hat eine begrenzte Lebensdauer und würde im Dokument veralten; der Pfad
   * bleibt gültig, solange die Datei existiert. Angezeigt wird über kurzlebige
   * Signed URLs aus `mangelImageUrls` — dieselbe Bauweise wie bei den
   * Bug-Report-Anhängen.
   */
  images?: string[];
  group: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Die Eingabe des Clients. Systemfelder stehen bewusst nicht darin. */
export interface MangelInput {
  vehicleId: string;
  description: string;
  /** Muss einer der Werte aus `MANGEL_STATUSES` sein; Vorgabe `'open'`. */
  status?: string;
  entryId?: string;
  /** ISO-Zeitstempel; Vorgabe ist der Zeitpunkt des Anlegens. */
  reportedAt?: string;
  /**
   * Der Melder, wenn er nicht der Schreibende ist — der Fahrer einer Fahrt
   * oder ein Gast über den Freigabelink.
   */
  reportedByName?: string;
  reportedBy?: string;
  /**
   * Bereits hochgeladene Bilder als Storage-Pfade. Wird gegen den erlaubten
   * Pfad der Gruppe geprüft — siehe `sanitizeMangelImages`.
   */
  images?: string[];
}

export interface MangelActor {
  userId: string;
  userName: string;
  now: string;
}

export interface MangelVehicle {
  name?: string;
}

function isMangelStatus(value: unknown): value is MangelStatus {
  return MANGEL_STATUSES.includes(value as MangelStatus);
}

/**
 * Wurzel der Bilder im Storage. Spiegelt `GROUP_COLLECTION_ID` aus
 * `components/firebase/firestore.ts`, wird aber hier wiederholt: Diese Datei
 * läuft auch auf dem Server und im Test und soll nichts aus dem
 * Komponentenbaum ziehen.
 */
const MANGEL_STORAGE_ROOT = 'groups';

/**
 * Höchstzahl der Bilder je Mangel. Nicht als Schikane, sondern weil die
 * Anzeige jedes Bild einzeln signieren muss — und weil ein Mangel, der zwanzig
 * Fotos braucht, in Wahrheit mehrere Mängel sind.
 */
export const MANGEL_MAX_IMAGES = 10;

/**
 * Größtes Bild, das der Storage annimmt.
 *
 * Die Schranke ist die `storage.rules`, nicht diese Zahl — hier steht nur ihre
 * Kopie für die Prüfung im Browser. Ohne sie lehnt der Storage einen zu großen
 * Upload mit `storage/unauthorized` ab, und der Melder liest „Ein Bild konnte
 * nicht hochgeladen werden", ohne je zu erfahren, dass sein Foto zu groß war.
 * Ausgerechnet der Rückfallpfad von `compressImage` (HEIC am Desktop, kaputte
 * Datei) reicht das Original unverkleinert durch und läuft genau da hinein.
 *
 * Wer den Wert ändert, ändert `storage.rules` mit — ein Test hier vergleicht
 * beide, und ausgerollt wird die Regel über einen terraform-Apply.
 */
export const MANGEL_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Ob der Contenttype durch die Regel kommt. Bewusst derselbe Ausdruck wie dort
 * (`matches('image/.*')`, auf die ganze Zeichenkette): Was der Browser
 * durchlässt, muss der Storage annehmen — sonst ist die Prüfung hier nur eine
 * zweite Fehlerquelle.
 */
export function isAllowedMangelImageType(contentType: string): boolean {
  return /^image\/.*$/.test(contentType ?? '');
}

/**
 * Ein Dateiname, der in einem Storage-Pfad keinen Schaden anrichtet. Alles
 * außerhalb von `[A-Za-z0-9._-]` fällt weg — insbesondere `/` und `..`, die
 * sonst aus dem Ordner des Mangels herausführten. Gleiche Regel wie bei
 * `uploadBugReportFile`.
 */
export function sanitizeMangelFileName(fileName: string): string {
  const safe = (fileName || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  // Ein Name aus lauter Punkten (`.`, `..`) wäre nach dem Ersetzen immer noch
  // ein Pfadsegment mit Sonderbedeutung.
  return /^\.+$/.test(safe) || !safe ? 'bild' : safe;
}

/** Der Ordner eines Mangels: `groups/{groupId}/mangel/{mangelId}`. */
export function mangelImageFolder(groupId: string, mangelId: string): string {
  return `${MANGEL_STORAGE_ROOT}/${groupId}/${FAHRTENBUCH_MANGEL_COLLECTION_ID}/${mangelId}`;
}

/** Der vollständige Storage-Pfad einer Bilddatei. */
export function mangelImagePath(
  groupId: string,
  mangelId: string,
  fileName: string,
): string {
  return `${mangelImageFolder(groupId, mangelId)}/${sanitizeMangelFileName(fileName)}`;
}

/**
 * Filtert eine vom Client behauptete Bilderliste auf das, was zu dieser Gruppe
 * gehört.
 *
 * Der Pfad kommt aus dem Browser und ist damit frei wählbar: Ohne diese Prüfung
 * ließe sich ein Mangel auf `groups/andere/...` oder `bugReports/...` zeigen —
 * und die Anzeige signiert anschließend brav, was im Dokument steht. Deshalb
 * exakt vier Segmente unter der eigenen Gruppe, keine leeren Namen, keine
 * Dubletten und höchstens `MANGEL_MAX_IMAGES`.
 */
export function sanitizeMangelImages(
  images: unknown,
  groupId: string,
): string[] {
  if (!Array.isArray(images)) return [];
  const prefix = `${MANGEL_STORAGE_ROOT}/${groupId}/${FAHRTENBUCH_MANGEL_COLLECTION_ID}/`;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of images) {
    if (typeof entry !== 'string') continue;
    // Ein führender Schrägstrich ist derselbe Pfad — der Firebase-Client gibt
    // `fullPath` ohne ihn zurück, ältere Aufrufer schrieben ihn mit.
    const path = entry.trim().replace(/^\/+/, '');
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length).split('/');
    if (rest.length !== 2) continue;
    if (!rest[0] || !rest[1]) continue;
    if (rest.some((segment) => segment === '.' || segment === '..')) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    result.push(path);
    if (result.length >= MANGEL_MAX_IMAGES) break;
  }
  return result;
}

/**
 * Harte Validierung. Liefert eine Liste von Fehlerschlüsseln; leer heißt
 * gültig — dieselbe Bauweise wie `validateEntryInput`.
 */
export function validateMangelInput(input: MangelInput): string[] {
  const errors: string[] = [];
  if (!input.vehicleId?.trim()) errors.push('vehicleMissing');
  // Ein Mangel ohne Beschreibung sagt niemandem, was kaputt ist — dieselbe
  // Begründung wie beim Defekt-Häkchen am Fahrtenbuch-Eintrag.
  if (!input.description?.trim()) errors.push('descriptionMissing');
  if (input.status !== undefined && !isMangelStatus(input.status)) {
    errors.push('statusInvalid');
  }
  if (
    input.reportedAt !== undefined &&
    Number.isNaN(Date.parse(input.reportedAt))
  ) {
    errors.push('reportedAtInvalid');
  }
  return errors;
}

/**
 * Baut das zu speichernde Dokument. Systemfelder werden serverseitig gesetzt,
 * Clientwerte dafür verworfen. Wirft bei ungültiger Eingabe.
 *
 * `reportedBy`/`reportedByName` dürfen von außen kommen, `createdBy` nie: Wer
 * den Mangel bemerkt hat, ist eine andere Frage als wer den Datensatz
 * geschrieben hat. Bei einem Mangel aus einer Fahrt fallen die beiden
 * auseinander — gemeldet hat der Fahrer, geschrieben hat der Server im Auftrag
 * dessen, der die Fahrt erfasst.
 */
export function buildMangelDocument(
  input: MangelInput,
  vehicle: MangelVehicle,
  group: string,
  actor: MangelActor,
): Mangel {
  const errors = validateMangelInput(input);
  if (errors.length > 0) {
    throw new Error(`invalid mangel: ${errors.join(', ')}`);
  }

  const doc: Mangel = {
    vehicleId: input.vehicleId.trim(),
    vehicleName: vehicle.name ?? '',
    description: input.description.trim(),
    status: isMangelStatus(input.status) ? input.status : 'open',
    notes: [],
    reportedAt: input.reportedAt ?? actor.now,
    reportedBy: input.reportedBy ?? actor.userId,
    reportedByName: input.reportedByName?.trim() || actor.userName,
    group,
    createdAt: actor.now,
    createdBy: actor.userId,
    updatedAt: actor.now,
    updatedBy: actor.userId,
  };
  // Nicht `doc.entryId = input.entryId`: Firestore lehnt `undefined` ab.
  if (input.entryId) doc.entryId = input.entryId;
  // Ohne Bilder bleibt das Feld weg statt als leeres Array dazustehen — ein
  // Mangel ohne Bilder soll sich von einem aus der Zeit vor diesem Feld nicht
  // unterscheiden.
  const images = sanitizeMangelImages(input.images, group);
  if (images.length > 0) doc.images = images;
  return doc;
}

/**
 * Das Patch-Objekt eines Statuswechsels.
 *
 * `resolvedAt: null` ist das Löschsignal für den Aufrufer (`FieldValue.delete()`
 * beim Schreiben): `undefined` ließe das Feld beim Merge stehen, und ein wieder
 * geöffneter Mangel behielte sein Behebungsdatum.
 */
export interface MangelStatusPatch {
  status: MangelStatus;
  resolvedAt?: string | null;
  notes: MangelNote[];
  updatedAt: string;
  updatedBy: string;
}

export interface ApplyMangelStatusOptions {
  /** Notiz, die den Statuswechsel begleitet. */
  note?: string;
  /**
   * Korrigiertes Behebungsdatum. Ohne Angabe „jetzt" — ein Mangel, der vorige
   * Woche behoben und erst heute nachgetragen wurde, bekäme sonst ein falsches
   * Datum.
   */
  resolvedAt?: string;
}

/**
 * Statuswechsel als Patch, inklusive Verlaufseintrag.
 *
 * Ein unveränderter Status erzeugt keinen Verlaufseintrag: Sonst füllte jedes
 * Speichern des Dialogs den Verlauf mit „Status: offen"-Zeilen, obwohl niemand
 * etwas geändert hat. Eine Notiz allein wird trotzdem angehängt.
 */
export function applyMangelStatus(
  mangel: Pick<Mangel, 'status' | 'notes'>,
  status: MangelStatus,
  actor: MangelActor,
  options: ApplyMangelStatusOptions = {},
): MangelStatusPatch {
  if (!isMangelStatus(status)) {
    throw new Error('invalid mangel: statusInvalid');
  }
  if (
    options.resolvedAt !== undefined &&
    Number.isNaN(Date.parse(options.resolvedAt))
  ) {
    throw new Error('invalid mangel: resolvedAtInvalid');
  }

  const changed = mangel.status !== status;
  const text = options.note?.trim() ?? '';
  const notes = [...(mangel.notes ?? [])];
  if (changed || text) {
    const note: MangelNote = {
      text,
      at: actor.now,
      by: actor.userId,
      byName: actor.userName,
    };
    if (changed) note.status = status;
    notes.push(note);
  }

  const patch: MangelStatusPatch = {
    status,
    notes,
    updatedAt: actor.now,
    updatedBy: actor.userId,
  };

  if (status === 'resolved') {
    // Nur beim Übergang nach „behoben" oder bei einer ausdrücklichen
    // Korrektur. Ein bereits behobener Mangel, der bloß eine Notiz bekommt,
    // behält sein Datum — sonst wanderte es bei jeder Notiz nach vorn.
    if (changed || options.resolvedAt !== undefined) {
      patch.resolvedAt = options.resolvedAt ?? actor.now;
    }
  } else if (changed) {
    patch.resolvedAt = null;
  }

  return patch;
}

export interface MangelNotePatch {
  notes: MangelNote[];
  updatedAt: string;
  updatedBy: string;
}

/** Notiz an den Verlauf anhängen. */
export function appendMangelNote(
  mangel: Pick<Mangel, 'notes'>,
  text: string,
  actor: MangelActor,
): MangelNotePatch {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) {
    throw new Error('invalid mangel: noteMissing');
  }
  return {
    notes: [
      ...(mangel.notes ?? []),
      { text: trimmed, at: actor.now, by: actor.userId, byName: actor.userName },
    ],
    updatedAt: actor.now,
    updatedBy: actor.userId,
  };
}

/**
 * Ob der Mangel noch Arbeit macht. Ein fehlender Status gilt als offen: Ein
 * Datensatz aus einer künftigen Migration oder mit einem Schreibfehler soll
 * sichtbar bleiben und nicht stillschweigend als behoben durchgehen.
 */
export function isOpenMangel(mangel: Pick<Mangel, 'status'>): boolean {
  return mangel.status !== 'resolved';
}

/** Der Zähler für den Fahrzeug-Cache `openMangelCount`. */
export function openMangelCount(mangel: Pick<Mangel, 'status'>[]): number {
  return mangel.filter(isOpenMangel).length;
}
