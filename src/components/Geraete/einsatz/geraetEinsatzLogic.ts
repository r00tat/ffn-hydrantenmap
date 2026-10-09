import {
  formatLagerort,
  GERAET_MAX_MENGE,
  type Geraet,
  type GeraetBestand,
  type GeraetChargeTeil,
  type GeraetEinsatz,
  type GeraetEinsatzArt,
  type GeraetLagerort,
} from '../../../common/geraet';
import { clean } from '../../../common/geraetBestandLogic';
import {
  activeChargen,
  allocateFefo,
  applyChargeDelta,
  needsChargeChoice,
} from '../../../common/geraetCharge';

/**
 * Reine Logik des Einsatz-Abschnitts „Geräte & Material": Suche, Vorbelegung
 * des Lagerorts und der Datensatz eines `geraetEinsatz`-Eintrags. Ohne
 * Firestore, damit sie ohne Mocks testbar ist.
 */

export function normalizeCode(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Die Kennungen, über die ein Artikel per Scan oder Eingabe gefunden wird. */
export function geraetCodesOf(g: Geraet): string[] {
  return [
    ...(g.barcodes ?? []),
    g.inventarNr,
    g.zusatzInventarNr,
    g.seriennummer,
    g.externeId,
  ]
    .map((c) => normalizeCode(c))
    .filter(Boolean);
}

/**
 * Alles, worüber ein Artikel gefunden werden soll. Die Bezeichnung allein
 * reicht nicht: In Sybos heißt ein Gerät „Mehrgasmessgerät 1", ein anderes
 * „Dräger - Prüfgas X-am" — dass beide zu den Gasmessgeräten gehören, steht
 * nur in Klasse und Vorlage.
 */
function searchTextOf(g: Geraet): string {
  return [
    g.bezeichnung,
    g.herstellerTyp,
    g.hersteller,
    g.vorlage,
    g.kategorie,
    g.klasse1,
    g.klasse2,
    g.klasse3,
    g.bemerkung,
    g.zubehoer,
    ...geraetCodesOf(g),
  ]
    .map((c) => normalizeCode(c))
    .join(' ');
}

/**
 * Artikel für die Suche im Dialog: alle Suchwörter müssen irgendwo am Artikel
 * vorkommen (`searchTextOf`). Artikel, deren Bezeichnung alle Wörter enthält,
 * stehen vorn — sonst verdrängte die Klasse „Messgeräte und Nachweismittel"
 * das eigentlich gesuchte Gerät. Inaktive Artikel fehlen — sie werden im
 * Einsatz nicht mehr verwendet.
 */
export function searchGeraete(geraete: Geraet[], text: string, limit = 50): Geraet[] {
  const words = normalizeCode(text).split(' ').filter(Boolean);
  const byName: Geraet[] = [];
  const byOther: Geraet[] = [];
  for (const g of geraete) {
    if (g.active === false) continue;
    if (words.length === 0) {
      byName.push(g);
      if (byName.length >= limit) break;
      continue;
    }
    const name = normalizeCode(g.bezeichnung);
    if (words.every((w) => name.includes(w))) {
      byName.push(g);
      if (byName.length >= limit) break;
    } else if (byOther.length < limit && words.every((w) => searchTextOf(g).includes(w))) {
      byOther.push(g);
    }
  }
  return [...byName, ...byOther].slice(0, limit);
}

/** Exakter Treffer eines gescannten oder getippten Codes. */
export function findGeraetByCode(geraete: Geraet[], code: string): Geraet[] {
  const wanted = normalizeCode(code);
  if (!wanted) return [];
  return geraete.filter((g) => g.active !== false && geraetCodesOf(g).includes(wanted));
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
 * Liegt der Lagerort auf einem Fahrzeug des Einsatzes oder in einem Container,
 * der dem Einsatz zugeordnet ist?
 *
 * Fahrzeuge werden über den Namen als ganzes Wort verglichen, in beide
 * Richtungen: „SRF" am Lagerort passt auf das Einsatzmittel „SRF Neusiedl"
 * und umgekehrt — die Namen sind in Sybos und auf der Karte nicht gleich
 * gepflegt. Ein Container ist dagegen selbst ein Artikel; er ist am Einsatz,
 * wenn er dort zugeordnet ist (`containerIds`).
 */
export function matchesFirecallVehicle(
  lagerort: GeraetLagerort,
  vehicleNames: string[],
  containerIds: string[] = [],
): boolean {
  if (lagerort.art === 'container') {
    return !!lagerort.containerId && containerIds.includes(lagerort.containerId);
  }
  if (lagerort.art !== 'fahrzeug') return false;
  const fahrzeug = normalizeCode(lagerort.fahrzeug);
  if (!fahrzeug) return false;
  return vehicleNames.some((name) => {
    const vehicle = normalizeCode(name);
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
 * oder in einem Container des Einsatzes (dort wurde das Material am ehesten
 * entnommen), sonst der mit dem größten Bestand.
 */
export function pickDefaultBestand(
  bestaende: GeraetBestand[],
  vehicleNames: string[],
  containerIds: string[] = [],
): GeraetBestand | undefined {
  const onVehicle = bestaende.filter((b) =>
    matchesFirecallVehicle(b.lagerort, vehicleNames, containerIds),
  );
  return largest(onVehicle) ?? largest(bestaende);
}

export interface GeraetEinsatzInput {
  geraet: Geraet | undefined;
  bestandId?: string;
  menge?: number;
  stunden?: number;
  bemerkung?: string;
  /**
   * Bei Verbrauch: der Lagerort hinter `bestandId`. Nur mit ihm lässt sich
   * die Menge auf Chargen aufteilen.
   */
  bestand?: GeraetBestand;
  /** Von Hand angegebene Aufteilung auf Chargen (Einzeldialog). */
  chargen?: GeraetChargeTeil[];
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
 * Die Aufteilung eines Verbrauchs auf Chargen — nur, wenn der Artikel
 * Chargen führt oder der Lagerort schon aufgeteilt ist. Eine angegebene
 * Aufteilung (Einzeldialog) gilt als geprüft; sonst wird nach FEFO
 * vorbelegt, und geprüft ist sie nur, wenn es ohnehin nur einen Topf gab.
 */
function chargenFields(
  input: GeraetEinsatzInput & { geraet: Geraet },
  fields: ReturnType<typeof relevantFields>,
): { chargen: GeraetChargeTeil[]; chargenGeprueft: boolean } | undefined {
  const { geraet, bestand } = input;
  if (!geraet.verbrauchsmaterial || !fields.bestandId || !bestand) return undefined;
  if (fields.menge === undefined) return undefined;
  const hasMap = Object.keys(bestand.chargen ?? {}).length > 0;
  if (activeChargen(geraet).length === 0 && !hasMap) return undefined;
  if (input.chargen) return { chargen: input.chargen, chargenGeprueft: true };
  const chargen = geraet.chargen ?? [];
  return {
    chargen: allocateFefo(bestand, chargen, fields.menge),
    chargenGeprueft: !needsChargeChoice(bestand, chargen),
  };
}

/**
 * Der Lagerort, wie ihn das Bearbeiten eines Verbrauchs sieht: Ist der
 * Eintrag schon von diesem Lagerort abgebucht, zählt seine Menge wieder zum
 * Bestand — sonst fehlte die gerade verbrauchte Charge in der Auswahl. Ohne
 * gültige Aufteilung hat der Server vom Rest ohne Charge gebucht.
 */
export function bestandForEdit(
  bestand: GeraetBestand | undefined,
  entry: GeraetEinsatz | undefined,
): GeraetBestand | undefined {
  if (!bestand || !entry || entry.art !== 'verbraucht' || entry.gebucht !== true) return bestand;
  if (entry.bestandId !== bestand.id || typeof entry.menge !== 'number') return bestand;
  let chargen = bestand.chargen ?? {};
  const teile = entry.chargen ?? [];
  const sum = teile.reduce((s, t) => s + (Number.isFinite(t.menge) ? t.menge : 0), 0);
  if (teile.length > 0 && clean(sum) === clean(entry.menge)) {
    for (const teil of teile) chargen = applyChargeDelta(chargen, teil.chargeId, teil.menge);
  }
  return { ...bestand, anzahl: clean((bestand.anzahl ?? 0) + entry.menge), chargen };
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
  const chargen = chargenFields(input, fields);
  if (chargen) {
    data.chargen = chargen.chargen;
    data.chargenGeprueft = chargen.chargenGeprueft;
  }
  return data;
}

/**
 * Änderung eines bestehenden Eintrags. Geleerte Felder werden gelöscht
 * (`deleteValue` liefert `deleteField()`). Ein geänderter Verbrauch gilt bis
 * zum Abgleich am Server wieder als nicht gebucht.
 */
export function buildGeraetEinsatzUpdate<D>(
  input: GeraetEinsatzInput & {
    geraet: Geraet;
    /** Der bisherige Lagerort des Eintrags. */
    entryBestandId?: string;
  },
  deleteValue: () => D,
): Record<string, string | number | boolean | GeraetChargeTeil[] | D> {
  const fields = relevantFields(input);
  const patch: Record<string, string | number | boolean | GeraetChargeTeil[] | D> = {};
  for (const [key, value] of Object.entries(fields)) {
    patch[key] = value === undefined ? deleteValue() : value;
  }
  // Ein Lagerort, der sich nicht nachschlagen lässt, aber unverändert ist:
  // Die Aufteilung bleibt, wie sie ist. Sonst wanderte schon beim Ändern der
  // Bemerkung die Buchung auf „ohne Charge".
  const keepChargen =
    input.geraet.verbrauchsmaterial &&
    !input.bestand &&
    !!fields.bestandId &&
    fields.bestandId === input.entryBestandId;
  if (!keepChargen) {
    const chargen = chargenFields(input, fields);
    patch.chargen = chargen ? chargen.chargen : deleteValue();
    patch.chargenGeprueft = chargen ? chargen.chargenGeprueft : deleteValue();
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

/** So viele Lagerorte nennt die Zeile unter einem Artikel, der Rest wird gezählt. */
const DETAIL_LAGERORTE = 2;

/**
 * Die zweite Zeile eines Artikels in der Auswahl: woran sich gleichnamige
 * Geräte unterscheiden lassen — Gattung, Hersteller und Typ, Seriennummer und
 * wo es liegt. „Mehrgasmessgerät 1" und „2" sind erst so auseinanderzuhalten.
 */
export function geraetOptionDetails(
  g: Pick<Geraet, 'vorlage' | 'klasse1' | 'hersteller' | 'herstellerTyp' | 'seriennummer'>,
  bestaende: GeraetBestand[],
): string {
  const herstellerTyp = [g.hersteller, g.herstellerTyp]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const lagerorte = [...new Set(bestaende.map((b) => formatLagerort(b.lagerort)).filter(Boolean))];
  const lagerortText =
    lagerorte.length > DETAIL_LAGERORTE + 1
      ? `${lagerorte.slice(0, DETAIL_LAGERORTE).join(', ')} +${lagerorte.length - DETAIL_LAGERORTE}`
      : lagerorte.join(', ');
  return [
    g.vorlage || g.klasse1,
    herstellerTyp,
    g.seriennummer ? `SN ${g.seriennummer}` : undefined,
    lagerortText,
  ]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}
