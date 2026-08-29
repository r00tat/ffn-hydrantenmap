import {
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
  normalizeCode,
} from './atemschutz';

/**
 * Import der Atemschutz-Stammdaten aus dem FDISK-Artikelexport.
 *
 * Der Export ist die einzige gepflegte Quelle für Inventar- und
 * Seriennummern — von Hand nachgetragen wäre er nach dem ersten Zugang
 * veraltet. Zwei Dinge machen den Import mehr als ein Spaltenmapping:
 * Kennungen sind nicht eindeutig (205 verschiedene IDs bei 214 Zeilen), und
 * Nenndruck, Volumen und die Bezirksreserve stehen nur im Klartext der
 * Bezeichnung.
 */

/** Die Spaltennamen des Exports. Erkannt wird über die Kopfzeile. */
export const ARTIKEL_SPALTEN = {
  externeId: 'ID',
  bezeichnung: 'Bezeichnung',
  inventarNr: 'Inventar-Nr.',
  zusatzInventarNr: 'Zusatz-Inventar-Nr.',
  barcodes: 'Barcodes',
  klasse3: 'Klasse 3',
  dienststelle: 'Dienststelle',
  status: 'Status',
  hersteller: 'Hersteller/Marke',
  baujahr: 'Herstellungs-Jahr (Baujahr)',
  seriennummer: 'Seriennummer',
  bemerkung: 'Bemerkung',
} as const;

/** Ohne die Bezeichnung ist eine Zeile nicht zuzuordnen. */
const PFLICHTSPALTEN = [ARTIKEL_SPALTEN.bezeichnung];

/** Die Felder, die der Import je Zeile setzt. Systemfelder fehlen bewusst. */
export type ImportGeraet = Partial<
  Omit<
    AtemschutzGeraet,
    'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
  >
> &
  Pick<AtemschutzGeraet, 'typ' | 'bezeichnung' | 'feuerwehr' | 'active'>;

const KLASSE_TYP: Record<string, AtemschutzGeraetTyp> = {
  atemluftflasche: 'flasche',
  atemmaske: 'maske',
  atemschutzgerät: 'pressluftatmer',
  atemschutzgeraet: 'pressluftatmer',
  zubehör: 'zubehoer',
  zubehoer: 'zubehoer',
};

/**
 * „Klasse 3" des Exports auf den Typ. Alles Unbekannte wird Zubehör: 33 der
 * 214 Zeilen haben keine Klasse 3, und eine leere Zeile stillschweigend zur
 * Flasche zu machen wäre die gefährlichere Annahme — eine Flasche taucht im
 * Füllprotokoll auf.
 */
export function typAusKlasse(klasse: string): AtemschutzGeraetTyp {
  return KLASSE_TYP[(klasse ?? '').trim().toLowerCase()] ?? 'zubehoer';
}

export interface BezeichnungsWerte {
  material?: string;
  volumenLiter?: number;
  bezirksreserve?: boolean;
}

/**
 * Material, Volumen und Bezirksreserve aus dem Klartext der Bezeichnung.
 *
 * Der Export hat für keines davon ein Feld. Die Ableitung ist eine
 * Erleichterung, keine Behauptung — im Vorschaudialog ist jeder Wert änderbar.
 */
export function werteAusBezeichnung(bezeichnung: string): BezeichnungsWerte {
  const werte: BezeichnungsWerte = {};
  const text = bezeichnung ?? '';

  const material = /\b(CFK|Stahl|Composite|Alu)\b/i.exec(text)?.[1];
  if (material) {
    werte.material =
      material.charAt(0).toUpperCase() + material.slice(1).toLowerCase();
    // "CFK" bleibt versal, nicht "Cfk".
    if (material.toUpperCase() === 'CFK') werte.material = 'CFK';
  }

  const volumen = /(\d+(?:[.,]\d+)?)\s*l\b/i.exec(text)?.[1];
  if (volumen) werte.volumenLiter = Number(volumen.replace(',', '.'));

  if (/bezirksreserve/i.test(text)) werte.bezirksreserve = true;
  return werte;
}

/**
 * Die Codes einer „Barcodes"-Zelle. Der Spaltenname ist Plural — die Zelle
 * kann mehrere Codes tragen, auch wenn heute nur eine von 214 Zeilen gefüllt
 * ist. Getrennt wird an allem, was als Trenner in Frage kommt; ein Barcode
 * enthält keine Leerzeichen.
 */
export function parseBarcodes(zelle: string): string[] {
  const codes = (zelle ?? '')
    .split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  return [...new Set(codes)];
}

/** 200 oder 300 aus einer Bemerkung wie „200BAR". */
function nenndruckAusBemerkung(bemerkung: string): number | undefined {
  const treffer = /(\d{3})\s*bar/i.exec(bemerkung ?? '')?.[1];
  const wert = treffer ? Number(treffer) : undefined;
  return wert === 200 || wert === 300 ? wert : undefined;
}

function spaltenIndex(kopf: string[]): Map<string, number> {
  const index = new Map<string, number>();
  kopf.forEach((name, i) => index.set((name ?? '').trim(), i));
  const fehlend = PFLICHTSPALTEN.filter((name) => !index.has(name));
  if (fehlend.length > 0) {
    throw new Error(`Spalte(n) nicht gefunden: ${fehlend.join(', ')}`);
  }
  return index;
}

/**
 * Wandelt das Raster (Kopfzeile plus Datenzeilen) in Geräte.
 *
 * Zeilen ohne Bezeichnung werden übersprungen: Der Export endet je nach
 * Ausgabeweg mit leeren Zeilen, und ein Gerät ohne Bezeichnung ließe sich in
 * keiner Liste wiedererkennen.
 */
export function rowsToGeraete(rows: string[][]): ImportGeraet[] {
  if (rows.length === 0) return [];
  const index = spaltenIndex(rows[0]);
  const feld = (row: string[], spalte: string): string =>
    (row[index.get(spalte) ?? -1] ?? '').trim();

  const geraete: ImportGeraet[] = [];
  for (const row of rows.slice(1)) {
    const bezeichnung = feld(row, ARTIKEL_SPALTEN.bezeichnung);
    if (!bezeichnung) continue;

    const werte = werteAusBezeichnung(bezeichnung);
    const typ = typAusKlasse(feld(row, ARTIKEL_SPALTEN.klasse3));
    const zusatzInventarNr = feld(row, ARTIKEL_SPALTEN.zusatzInventarNr);
    const seriennummer = feld(row, ARTIKEL_SPALTEN.seriennummer);
    const bemerkung = feld(row, ARTIKEL_SPALTEN.bemerkung);

    const geraet: ImportGeraet = {
      typ,
      bezeichnung,
      // Die Dienststelle ist im ganzen Export dieselbe; nur die Bezeichnung
      // verrät die Bezirksreserve.
      feuerwehr: werte.bezirksreserve
        ? 'Bezirksreserve'
        : feld(row, ARTIKEL_SPALTEN.dienststelle),
      active: feld(row, ARTIKEL_SPALTEN.status).toLowerCase() !== 'inaktiv',
    };

    const externeId = feld(row, ARTIKEL_SPALTEN.externeId);
    if (externeId) geraet.externeId = externeId;
    const inventarNr = feld(row, ARTIKEL_SPALTEN.inventarNr);
    if (inventarNr) geraet.inventarNr = inventarNr;
    if (zusatzInventarNr) geraet.zusatzInventarNr = zusatzInventarNr;
    if (seriennummer) geraet.seriennummer = seriennummer;
    if (bemerkung) geraet.bemerkung = bemerkung;

    const hersteller = feld(row, ARTIKEL_SPALTEN.hersteller);
    if (hersteller) geraet.hersteller = hersteller;
    const baujahr = Number(feld(row, ARTIKEL_SPALTEN.baujahr));
    if (Number.isFinite(baujahr) && baujahr > 1900) geraet.baujahr = baujahr;

    const barcodes = parseBarcodes(feld(row, ARTIKEL_SPALTEN.barcodes));
    if (barcodes.length > 0) geraet.barcodes = barcodes;

    // Die Flaschennummer der ASSP-Liste: erst die Zusatz-Inventar-Nr.
    // ("AF-2.16.19"), sonst die Seriennummer — ältere Flaschen tragen sie dort.
    const nummer = zusatzInventarNr
      ? zusatzInventarNr.replace(/^AF[-\s]?/i, '')
      : /^\d+(\.\d+)+$/.test(seriennummer)
        ? seriennummer
        : '';
    if (nummer) geraet.nummer = nummer;

    if (werte.material) geraet.material = werte.material;
    if (werte.volumenLiter) geraet.volumenLiter = werte.volumenLiter;

    // Nenndruck nur für Flaschen: Bei einer Maske wäre er eine Erfindung.
    if (typ === 'flasche') {
      geraet.nenndruck = nenndruckAusBemerkung(bemerkung) ?? 300;
    }

    geraete.push(geraet);
  }
  return geraete;
}

export type MatchedBy = 'externeId' | 'inventarNr' | 'seriennummer';

export interface ImportPlanZeile {
  geraet: ImportGeraet;
  status: 'new' | 'update';
  existingId?: string;
  matchedBy?: MatchedBy;
  /**
   * Eine frühere Zeile derselben Datei trägt dieselbe *führende* Kennung —
   * beide würden also auf dasselbe Dokument geschrieben.
   */
  duplicateInFile?: boolean;
  /** Die Zeile hat keine einzige Kennung — sie ist nie wieder zuzuordnen. */
  withoutIdentifier?: boolean;
}

/**
 * Gleicht die Importzeilen gegen den vorhandenen Bestand ab.
 *
 * Die Reihenfolge externeId → inventarNr → seriennummer ist die nach
 * Verlässlichkeit: Die FDISK-ID ist der Schlüssel des Quellsystems, die
 * Inventar-Nr. wird von der Feuerwehr vergeben, die Seriennummer steht im
 * Export nur bei einem Teil der Zeilen und ist dort mehrfach vergeben.
 */
export function abgleich(
  zeilen: ImportGeraet[],
  bestand: AtemschutzGeraet[],
): ImportPlanZeile[] {
  const byKey = (feld: MatchedBy) => {
    const map = new Map<string, AtemschutzGeraet>();
    for (const g of bestand) {
      const value = normalizeCode(g[feld] ?? '');
      // Erster Treffer gewinnt: Ist eine Kennung im Bestand doppelt vergeben,
      // ist jede Wahl willkürlich — aber sie muss über Läufe hinweg dieselbe
      // sein, sonst wandert der Import bei jedem Durchgang.
      if (value && !map.has(value)) map.set(value, g);
    }
    return map;
  };

  const maps: Record<MatchedBy, Map<string, AtemschutzGeraet>> = {
    externeId: byKey('externeId'),
    inventarNr: byKey('inventarNr'),
    seriennummer: byKey('seriennummer'),
  };
  const reihenfolge: MatchedBy[] = ['externeId', 'inventarNr', 'seriennummer'];

  const gesehen = new Set<string>();
  return zeilen.map((geraet) => {
    const zeile: ImportPlanZeile = { geraet, status: 'new' };

    const kennungen = reihenfolge
      .map((feld) => ({ feld, value: normalizeCode(geraet[feld] ?? '') }))
      .filter((k) => k.value.length > 0);

    if (kennungen.length === 0) {
      zeile.withoutIdentifier = true;
      return zeile;
    }

    for (const { feld, value } of kennungen) {
      const treffer = maps[feld].get(value);
      if (treffer) {
        zeile.status = 'update';
        zeile.existingId = treffer.id;
        zeile.matchedBy = feld;
        break;
      }
    }

    // Kollision innerhalb der Datei — der Export vergibt Kennungen mehrfach.
    //
    // Geprüft wird nur die *führende* Kennung, also die, die den Abgleich
    // entscheidet. Über alle drei zu prüfen wäre falscher Alarm: Im echten
    // Export teilen sich 41 Zeilen irgendeine Kennung, aber nur 9 dieselbe
    // führende. Die übrigen 32 haben eine eigene FDISK-ID und landen sauber
    // in eigenen Dokumenten — sie zum Überspringen vorzuschlagen hieße, ein
    // Sechstel des Bestands beim Import zu verlieren.
    const primaer = `${kennungen[0].feld}:${kennungen[0].value}`;
    if (gesehen.has(primaer)) zeile.duplicateInFile = true;
    gesehen.add(primaer);

    return zeile;
  });
}
