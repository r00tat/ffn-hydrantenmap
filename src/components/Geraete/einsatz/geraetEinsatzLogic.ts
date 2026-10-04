import {
  GERAET_MAX_MENGE,
  type Geraet,
  type GeraetBestand,
  type GeraetEinsatz,
  type GeraetEinsatzArt,
  type GeraetLagerort,
} from '../../../common/geraet';

/**
 * Reine Logik des Einsatz-Abschnitts „Geräte & Material": Suche, Vorbelegung
 * des Lagerorts und der Datensatz eines `geraetEinsatz`-Eintrags. Ohne
 * Firestore, damit sie ohne Mocks testbar ist.
 */

function normalize(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Die Kennungen, über die ein Artikel per Scan oder Eingabe gefunden wird. */
function codesOf(g: Geraet): string[] {
  return [
    ...(g.barcodes ?? []),
    g.inventarNr,
    g.zusatzInventarNr,
    g.seriennummer,
    g.externeId,
  ]
    .map((c) => normalize(c))
    .filter(Boolean);
}

function searchTextOf(g: Geraet): string {
  return [g.bezeichnung, g.herstellerTyp, g.hersteller, ...codesOf(g)]
    .map((c) => normalize(c))
    .join(' ');
}

/**
 * Artikel für die Suche im Dialog: alle Suchwörter müssen in Bezeichnung,
 * Hersteller oder einer Kennung vorkommen. Inaktive Artikel fehlen — sie
 * werden im Einsatz nicht mehr verwendet.
 */
export function searchGeraete(geraete: Geraet[], text: string, limit = 50): Geraet[] {
  const words = normalize(text).split(' ').filter(Boolean);
  const result: Geraet[] = [];
  for (const g of geraete) {
    if (g.active === false) continue;
    if (words.length > 0) {
      const haystack = searchTextOf(g);
      if (!words.every((w) => haystack.includes(w))) continue;
    }
    result.push(g);
    if (result.length >= limit) break;
  }
  return result;
}

/** Exakter Treffer eines gescannten oder getippten Codes. */
export function findGeraetByCode(geraete: Geraet[], code: string): Geraet[] {
  const wanted = normalize(code);
  if (!wanted) return [];
  return geraete.filter((g) => g.active !== false && codesOf(g).includes(wanted));
}

/** Verbrauchsmaterial wird verbraucht (bucht ab), alles andere nur zugeordnet. */
export function einsatzArtFor(g: Pick<Geraet, 'verbrauchsmaterial'>): GeraetEinsatzArt {
  return g.verbrauchsmaterial ? 'verbraucht' : 'zugeordnet';
}

/**
 * Wird die Verwendung in Stunden erfasst? Nur bei zugeordneten Geräten —
 * ein Verbrauch bucht Stück vom Lager ab.
 */
export function usesHours(
  g: Pick<Geraet, 'verbrauchsmaterial' | 'einheitVerwendungsnachweis'>,
): boolean {
  return !g.verbrauchsmaterial && g.einheitVerwendungsnachweis === 'h';
}

function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Liegt der Lagerort auf einem Fahrzeug des Einsatzes? Verglichen wird der
 * Name als ganzes Wort, in beide Richtungen: „SRF" am Lagerort passt auf das
 * Einsatzmittel „SRF Neusiedl" und umgekehrt — die Namen sind in Sybos und
 * auf der Karte nicht gleich gepflegt.
 */
export function matchesFirecallVehicle(
  lagerort: GeraetLagerort,
  vehicleNames: string[],
): boolean {
  if (lagerort.art !== 'fahrzeug') return false;
  const fahrzeug = normalize(lagerort.fahrzeug);
  if (!fahrzeug) return false;
  return vehicleNames.some((name) => {
    const vehicle = normalize(name);
    return (
      !!vehicle && (containsWords(vehicle, fahrzeug) || containsWords(fahrzeug, vehicle))
    );
  });
}

function largest(bestaende: GeraetBestand[]): GeraetBestand | undefined {
  let best: GeraetBestand | undefined;
  for (const b of bestaende) {
    if (!best || (b.anzahl ?? 0) > (best.anzahl ?? 0)) best = b;
  }
  return best;
}

/**
 * Vorbelegung des Lagerorts beim Verbrauch: ein Lagerort auf einem Fahrzeug
 * des Einsatzes (dort wurde das Material am ehesten entnommen), sonst der mit
 * dem größten Bestand.
 */
export function pickDefaultBestand(
  bestaende: GeraetBestand[],
  vehicleNames: string[],
): GeraetBestand | undefined {
  const onVehicle = bestaende.filter((b) =>
    matchesFirecallVehicle(b.lagerort, vehicleNames),
  );
  return largest(onVehicle) ?? largest(bestaende);
}

export interface GeraetEinsatzInput {
  geraet: Geraet | undefined;
  bestandId?: string;
  menge?: number;
  stunden?: number;
  bemerkung?: string;
}

export type GeraetEinsatzValidationError =
  | 'noGeraet'
  | 'invalidMenge'
  | 'invalidStunden'
  | 'noBestand';

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Endlich und nicht über der Obergrenze, die auch der Server prüft. */
function isWithinLimit(value: unknown): value is number {
  return isNumber(value) && value <= GERAET_MAX_MENGE;
}

/**
 * Prüft die Eingabe des Dialogs. `bestandCount` ist die Zahl der Lagerorte des
 * Artikels: Ohne einen einzigen lässt sich nichts abbuchen, der Verbrauch wird
 * trotzdem dokumentiert.
 */
export function validateGeraetEinsatzInput(
  input: GeraetEinsatzInput,
  bestandCount = 0,
): GeraetEinsatzValidationError | null {
  const { geraet } = input;
  if (!geraet) return 'noGeraet';
  if (geraet.verbrauchsmaterial) {
    if (!isWithinLimit(input.menge) || input.menge <= 0) return 'invalidMenge';
    if (!input.bestandId && bestandCount > 0) return 'noBestand';
    return null;
  }
  if (usesHours(geraet)) {
    if (input.stunden !== undefined && (!isWithinLimit(input.stunden) || input.stunden < 0)) {
      return 'invalidStunden';
    }
    return null;
  }
  if (input.menge !== undefined && (!isWithinLimit(input.menge) || input.menge < 0)) {
    return 'invalidMenge';
  }
  return null;
}

/**
 * Der Artikel, wie ihn das Bearbeiten eines bestehenden Eintrags sieht.
 *
 * Die Art eines Eintrags ändert sich nie: Ein Verbrauch bleibt ein Verbrauch,
 * auch wenn der Gerätemeister „Verbrauchsmaterial" seither abgehakt hat — und
 * umgekehrt. Ebenso bleibt eine Verwendung in Stunden in Stunden. Würde der
 * Dialog den heutigen Stand des Artikels nehmen, löschte schon das Ändern der
 * Bemerkung den Lagerort eines gebuchten Verbrauchs, und der Abgleich
 * storniert ihn.
 */
export function geraetForEntry(geraet: Geraet, entry: GeraetEinsatz): Geraet {
  const einheitVerwendungsnachweis =
    entry.art === 'verbraucht'
      ? geraet.einheitVerwendungsnachweis
      : typeof entry.stunden === 'number'
        ? 'h'
        : typeof entry.menge === 'number'
          ? 'stk'
          : geraet.einheitVerwendungsnachweis;
  return {
    ...geraet,
    verbrauchsmaterial: entry.art === 'verbraucht',
    einheitVerwendungsnachweis,
  };
}

/** Die Felder, die je nach Art des Artikels gelten. */
function relevantFields(input: GeraetEinsatzInput & { geraet: Geraet }) {
  const { geraet } = input;
  const verbraucht = geraet.verbrauchsmaterial;
  const hours = usesHours(geraet);
  const bemerkung = (input.bemerkung ?? '').trim();
  return {
    bestandId: verbraucht && input.bestandId ? input.bestandId : undefined,
    menge: !hours && isNumber(input.menge) ? input.menge : undefined,
    stunden: hours && isNumber(input.stunden) ? input.stunden : undefined,
    bemerkung: bemerkung || undefined,
  };
}

/**
 * Der neue Eintrag unter `call/{firecallId}/geraetEinsatz`. Ohne
 * `undefined`-Felder — Firestore lehnt sie ab.
 */
export function buildGeraetEinsatzData(
  input: GeraetEinsatzInput & {
    geraet: Geraet;
    groupId: string;
    nowIso: string;
    createdBy: string;
  },
): Omit<GeraetEinsatz, 'id'> {
  const fields = relevantFields(input);
  const data: Omit<GeraetEinsatz, 'id'> = {
    groupId: input.groupId,
    geraetId: input.geraet.id,
    geraetName: input.geraet.bezeichnung,
    art: einsatzArtFor(input.geraet),
    zeitpunkt: input.nowIso,
    createdAt: input.nowIso,
    createdBy: input.createdBy,
  };
  if (fields.bestandId !== undefined) data.bestandId = fields.bestandId;
  if (fields.menge !== undefined) data.menge = fields.menge;
  if (fields.stunden !== undefined) data.stunden = fields.stunden;
  if (fields.bemerkung !== undefined) data.bemerkung = fields.bemerkung;
  return data;
}

/**
 * Änderung eines bestehenden Eintrags. Geleerte Felder werden gelöscht
 * (`deleteValue` liefert `deleteField()`). Ein geänderter Verbrauch gilt bis
 * zum Abgleich am Server wieder als nicht gebucht.
 */
export function buildGeraetEinsatzUpdate<D>(
  input: GeraetEinsatzInput & { geraet: Geraet },
  deleteValue: () => D,
): Record<string, string | number | boolean | D> {
  const fields = relevantFields(input);
  const patch: Record<string, string | number | boolean | D> = {};
  for (const [key, value] of Object.entries(fields)) {
    patch[key] = value === undefined ? deleteValue() : value;
  }
  if (input.geraet.verbrauchsmaterial) patch.gebucht = false;
  return patch;
}

/** Ein Verbrauch, den der Server noch nicht abgebucht hat. */
export function isPendingBooking(entry: Pick<GeraetEinsatz, 'art' | 'gebucht'>): boolean {
  return entry.art === 'verbraucht' && entry.gebucht !== true;
}

/** Anzeige eines Artikels in Suche und Liste. */
export function geraetOptionLabel(g: Pick<Geraet, 'bezeichnung' | 'inventarNr'>): string {
  return g.inventarNr ? `${g.bezeichnung} (${g.inventarNr})` : g.bezeichnung;
}
