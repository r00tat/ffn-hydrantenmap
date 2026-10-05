/**
 * Geräte und Lagerartikel einer Gruppe — Typen und reine Hilfsfunktionen.
 *
 * Bauweise wie `common/atemschutz.ts`: ohne Firestore, damit Client, Server
 * Actions und Import dieselben Typen teilen. Hintergrund im Design-Dokument
 * zu Issue #844 (Zuordnung zum Einsatz, Verbrauch, Nachbestellung).
 *
 * Die Feldnamen sind persistiert und bleiben deutsch.
 */

/** Subcollections unter `groups/{groupId}`. */
export const GERAET_COLLECTION = 'geraet';
export const GERAET_BESTAND_COLLECTION = 'geraetBestand';
export const GERAET_BUCHUNG_COLLECTION = 'geraetBuchung';

/** Subcollection unter `call/{firecallId}` — Zuordnung und Verbrauch. */
export const GERAET_EINSATZ_COLLECTION = 'geraetEinsatz';

/** Subcollection unter `groups/{groupId}` — Zusammenstellungen aus Artikeln. */
export const GERAET_SET_COLLECTION = 'geraetSet';

/**
 * Höchste Menge einer Buchung, eines Ist-Werts und eines Verbrauchs. Schützt
 * den Bestand vor unsinnigen Werten: Eine Menge wie `1e308` würde über die
 * Summe zu `-Infinity` und danach zu `NaN` — und damit den Gesamtbestand eines
 * Artikels dauerhaft zerstören. Ein `geraetEinsatz`-Eintrag ist vom Client
 * geschrieben, die Grenze prüft deshalb auch der Server.
 */
export const GERAET_MAX_MENGE = 100_000;

/** Eine gültige Menge: endlich, nicht negativ, höchstens `GERAET_MAX_MENGE`. */
export function isValidMenge(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= GERAET_MAX_MENGE
  );
}

/**
 * Eine Menge aus einem Eingabefeld, mit Komma oder Punkt. Kommazahlen sind
 * erlaubt — Ölbindemittel wird in kg oder l gezählt, und ein Bestand von 7,5
 * muss sich in der Inventur wieder setzen lassen. Leer oder ungültig:
 * `undefined`.
 */
export function parseMenge(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return isValidMenge(value) ? value : undefined;
}

/** Die vier Material-Typen des Sybos-Exports. */
export type GeraetMaterialTyp =
  | 'Einzelartikel'
  | 'Massenartikel'
  | 'Set-Artikel'
  | 'Set-Komponente';

export const GERAET_MATERIAL_TYPEN: GeraetMaterialTyp[] = [
  'Einzelartikel',
  'Massenartikel',
  'Set-Artikel',
  'Set-Komponente',
];

/**
 * Worin bei der Zuordnung im Einsatz gezählt wird. Sybos kennt daneben „-",
 * das hier als „nicht gesetzt" gilt.
 */
export type GeraetEinheitVerwendungsnachweis = 'stk' | 'h';

export type GeraetLagerortArt = 'fahrzeug' | 'raum' | 'container' | 'set';

/**
 * Die Kategorie, unter der Sybos Rollcontainer, Paletten und Kisten führt.
 * Ein Container ist dort ein eigener Artikel und kein Fahrzeug — als
 * Lagerort verweist er deshalb auf seinen Artikel (`containerId`).
 */
export const GERAET_KATEGORIE_CONTAINER = 'Container';

/** Ist der Artikel ein Container (und damit als Lagerort wählbar)? */
export function isContainer(g: Pick<Geraet, 'kategorie'>): boolean {
  return (g.kategorie ?? '').trim().toLowerCase() === GERAET_KATEGORIE_CONTAINER.toLowerCase();
}

/**
 * Ein Lagerort, wie ihn der Export beschreibt.
 *
 * Bewusst Text und keine Pflicht-Verknüpfung mit den Fahrtenbuch-Fahrzeugen:
 * Die Namen in Sybos und im Fahrtenbuch sind nicht gleich gepflegt.
 */
export interface GeraetLagerort {
  art: GeraetLagerortArt;
  /** Bei `fahrzeug`: Fahrzeug-Name aus dem Export, z. B. „SRF". */
  fahrzeug?: string;
  /** Bei `fahrzeug`: Laderaum, z. B. „GR 2". */
  laderaum?: string;
  /** Bei `raum`: Standort, z. B. „Feuerwehrhaus". */
  standort?: string;
  /** Bei `raum`: Raum, z. B. „Lager". */
  raum?: string;
  /** Bei `container`: Bezeichnung des Containers, z. B. „Ölsperren 1". */
  container?: string;
  /**
   * Bei `container`: ID des Container-Artikels. Teil der Identität — zwei
   * Container dürfen gleich heißen, und ein umbenannter Container bleibt
   * derselbe Lagerort.
   */
  containerId?: string;
  /** „Lagerort-Bemerkung" — kein Teil der Identität des Lagerorts. */
  bemerkung?: string;
  /** Optional verknüpftes Fahrtenbuch-Fahrzeug. */
  vehicleId?: string;
}

/** Stammdaten: `groups/{groupId}/geraet/{id}`. `id` = Sybos-ID beim Import. */
export interface Geraet {
  id: string;
  /** ID aus Sybos. */
  externeId?: string;
  bezeichnung: string;
  kategorie?: string;
  klasse1?: string;
  klasse2?: string;
  klasse3?: string;
  materialTyp?: GeraetMaterialTyp;
  inventarNr?: string;
  zusatzInventarNr?: string;
  barcodes?: string[];
  seriennummer?: string;
  hersteller?: string;
  herstellerTyp?: string;
  baujahr?: number;
  /** Herstellungs-Monat (1–12), nur zusammen mit `baujahr` aussagekräftig. */
  baumonat?: number;
  /** Einkaufspreis in Euro laut Sybos. */
  einkaufspreis?: number;
  besitzer?: string;
  bemerkung?: string;
  /** Sybos-Vorlage, z. B. „Gasmessgerät" — die Gattung hinter der Bezeichnung. */
  vorlage?: string;
  /** Zubehör laut Sybos, z. B. „Automatische Pumpe S/N: …". */
  zubehoer?: string;
  /** Anschaffungs-Datum (`YYYY-MM-DD`). */
  anschaffungsDatum?: string;
  /** „Verfügbar von" (`YYYY-MM-DD`), meist gleich dem Anschaffungs-Datum. */
  verfuegbarVon?: string;
  /** „Verfügbar bis" (`YYYY-MM-DD`) — etwa das Ablaufdatum eines Prüfgases. */
  verfuegbarBis?: string;
  /** Lebensdauer, Einheit in `lebensdauerEinheit`. */
  lebensdauer?: number;
  /** Einheit der Lebensdauer wie im Export, z. B. „Jahr(e)" oder „Monat(e)". */
  lebensdauerEinheit?: string;
  /** Haftpflicht-Versicherung laut Sybos — nur im Container-Export. */
  versicherung?: string;
  polizzenummer?: string;
  kasko?: string;
  einheitVerwendungsnachweis?: GeraetEinheitVerwendungsnachweis;
  /**
   * true → ein Verbrauch im Einsatz bucht vom Bestand ab. Eigenes Flag, weil
   * „Massenartikel" nicht „Verbrauchsmaterial" heißt (Kupplungsschlüssel).
   */
  verbrauchsmaterial: boolean;
  /** Anzeige, z. B. „Sack", „Stk". */
  einheit?: string;
  /** Gegen `bestandGesamt` — je Artikel über alle Lagerorte summiert. */
  mindestbestand?: number;
  /**
   * Summe aller `geraetBestand.anzahl`. Mitgeführt, damit Mindestbestand und
   * „Nachzubestellen" ohne Aggregation auskommen; nur in Transaktionen
   * geändert, die auch den Bestand ändern.
   */
  bestandGesamt: number;
  /** Gesetzt beim Unterschreiten, gelöscht beim Wiederauffüllen (ISO). */
  nachbestellenSeit?: string;
  /** Kostenersatz-Position, z. B. „12.05". */
  kostenersatzRateId?: string;
  /**
   * Zeitpunkt des letzten Imports (ISO). Buchungen danach heißen: Der
   * Bestand in der App ist neuer als der in Sybos.
   */
  importedAt?: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Bestand je Artikel und Lagerort: `groups/{groupId}/geraetBestand/{id}`. */
export interface GeraetBestand {
  id: string;
  geraetId: string;
  /** Aus `lagerortKey(lagerort)` — Teil der Import-Identität. */
  lagerortKey: string;
  lagerort: GeraetLagerort;
  /** Darf negativ werden: Die Realität geht vor. */
  anzahl: number;
  /**
   * Gelöschter Lagerort, auf den noch ein Verbrauch im Einsatz zeigt. Er
   * bleibt lesbar, damit der Einsatz seinen Lagerort zeigt und ein Storno
   * zurückbuchen kann; in Listen und Auswahl fehlt er.
   */
  archiviert?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export type GeraetBuchungArt =
  | 'verbrauch'
  | 'zugang'
  | 'umbuchung'
  | 'inventur'
  | 'import'
  | 'storno';

export const GERAET_BUCHUNG_ARTEN: GeraetBuchungArt[] = [
  'verbrauch',
  'zugang',
  'umbuchung',
  'inventur',
  'import',
  'storno',
];

/** Protokoll: `groups/{groupId}/geraetBuchung/{id}`. */
export interface GeraetBuchung {
  id: string;
  geraetId: string;
  bestandId: string;
  art: GeraetBuchungArt;
  /** Vorzeichenbehaftet: Verbrauch negativ, Zugang positiv. */
  menge: number;
  /** Bei Umbuchung: der Ziel-Lagerort. */
  zielBestandId?: string;
  firecallId?: string;
  /**
   * Bei Verbrauch/Storno aus dem Einsatz: der `geraetEinsatz`-Eintrag. Über
   * die Summe aller Buchungen mit dieser ID gleicht der Server den Bestand
   * idempotent ab (`reconcileVerbrauch`).
   */
  einsatzEintragId?: string;
  bemerkung?: string;
  createdAt: string;
  createdBy: string;
}

export type GeraetEinsatzArt = 'zugeordnet' | 'verbraucht';

/** Zuordnung/Verbrauch im Einsatz: `call/{firecallId}/geraetEinsatz/{id}`. */
export interface GeraetEinsatz {
  id: string;
  groupId: string;
  geraetId: string;
  /** Kopie, damit der Einsatz lesbar bleibt. */
  geraetName: string;
  art: GeraetEinsatzArt;
  /** Bei Verbrauch: der Lagerort, von dem abgebucht wird. */
  bestandId?: string;
  /** Stück. */
  menge?: number;
  /** Bei `einheitVerwendungsnachweis === 'h'`. */
  stunden?: number;
  zeitpunkt: string;
  bemerkung?: string;
  /** Das Set, aus dem der Eintrag stammt — nach dem Löschen des Sets ins Leere. */
  setId?: string;
  /** Kopie des Set-Namens, lesbar für Gäste und nach dem Löschen des Sets. */
  setName?: string;
  /**
   * Eine ID je Zuordnung eines Sets: Dasselbe Set kann zweimal im Einsatz
   * sein, „Ganzes Set entfernen" löscht genau eine Zuordnung.
   */
  setZuordnungId?: string;
  /** Der Server hat abgebucht — sonst „noch nicht synchronisiert". */
  gebucht?: boolean;
  /**
   * Stand des Eintrags für den Abgleich (Millisekunden seit 1970), gesetzt bei
   * jedem Anlegen und Ändern. Der Abgleich am Server bucht erst, wenn er
   * mindestens diesen Stand liest — sonst sähe er einen Eintrag, dessen
   * Änderung noch unterwegs ist, und buchte den alten Stand.
   */
  syncRev?: number;
  createdAt: string;
  createdBy: string;
}

/** Ein Inhalt eines Sets. */
export interface GeraetSetItem {
  geraetId: string;
  /** Stück; bei Verbrauchsmaterial die Verbrauchsmenge. Standard 1. */
  menge?: number;
  /** Fester Lagerort, nur bei Verbrauchsmaterial. */
  bestandId?: string;
}

/**
 * Ein Set: `groups/{groupId}/geraetSet/{id}`. Eigene Zusammenstellung,
 * optional an einen Sybos-Set-Artikel gebunden — der Export verrät nicht,
 * welche Komponente zu welchem Set gehört (docs/geraete-lager.md, „Sets").
 */
export interface GeraetSet {
  id: string;
  name: string;
  /** Geraet-ID eines Artikels mit Material-Typ „Set-Artikel". */
  sybosSetArtikelId?: string;
  /** Eigene Codes (Barcode, QR). */
  codes: string[];
  inhalt: GeraetSetItem[];
  active: boolean;
  bemerkung?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

function normalizePart(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Der stabile Schlüssel eines Lagerorts, z. B. `fahrzeug|srf|gr 2`.
 *
 * Nur die Spalten, die den Ort bestimmen — Bemerkung und Fahrzeugverknüpfung
 * gehören nicht dazu, sonst wäre der Lagerort nach einer Bemerkung beim
 * nächsten Import ein anderer. Leere Teile behalten ihren Platz, damit „SRF"
 * und „SRF · GR 2" nicht zusammenfallen.
 */
export function lagerortKey(l: GeraetLagerort): string {
  switch (l.art) {
    case 'fahrzeug':
      return ['fahrzeug', normalizePart(l.fahrzeug), normalizePart(l.laderaum)].join('|');
    case 'raum':
      return ['raum', normalizePart(l.standort), normalizePart(l.raum)].join('|');
    case 'container':
      return ['container', normalizePart(l.containerId ?? l.container)].join('|');
    default:
      return 'set';
  }
}

/**
 * Schlüssel einer Import-Abweichung, wie ihn `importGeraete` in
 * `acceptDeviations` erwartet. Die Artikel-ID steht vorn: Sie enthält nie
 * ein `|`, der `lagerortKey` dagegen schon.
 */
export function deviationKey(d: { geraetId: string; lagerortKey: string }): string {
  return `${d.geraetId}|${d.lagerortKey}`;
}

/**
 * Anzeige eines Lagerorts, z. B. „SRF · GR 2", „Feuerwehrhaus · Lager" oder
 * „Ölsperren 1". Eine Set-Komponente liegt „im Set" — welches, sagt der
 * Export nicht.
 */
export function formatLagerort(l: GeraetLagerort): string {
  const parts =
    l.art === 'fahrzeug'
      ? [l.fahrzeug, l.laderaum]
      : l.art === 'raum'
        ? [l.standort, l.raum]
        : l.art === 'container'
          ? [l.container]
          : ['Teil eines Set-Artikels'];
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** Liegt der Gesamtbestand unter dem Mindestbestand? Ohne Mindestbestand nie. */
export function isBelowMinimum(
  geraet: Pick<Geraet, 'bestandGesamt' | 'mindestbestand'>,
): boolean {
  return (
    typeof geraet.mindestbestand === 'number' &&
    Number.isFinite(geraet.mindestbestand) &&
    geraet.bestandGesamt < geraet.mindestbestand
  );
}
