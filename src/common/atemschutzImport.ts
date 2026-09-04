import {
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
  type FuellstationStandort,
  normalizeCode,
} from './atemschutz';

/**
 * Import der Atemschutz-Stammdaten aus dem Sybos-Artikelexport.
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
  klasse1: 'Klasse 1',
  klasse2: 'Klasse 2',
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

/**
 * Der einzige Statuswert, der eine Zeile vom Import ausschließt. Der Export
 * kennt nur „aktiv" und „inaktiv"; alles andere — auch eine leere Zelle —
 * wird importiert, statt an einem unbekannten Wert stillschweigend Bestand zu
 * verlieren.
 */
const STATUS_INAKTIV = 'inaktiv';

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
 * Die groben Klassen, an denen eine Füllstation zu erkennen ist.
 *
 * Der Export der Füllstationen ist ein eigener Lauf mit eigenem Klassenbaum:
 * Klasse 3 ist dort leer, der Typ steht in Klasse 1 ("Atemlufterzeugung") und
 * Klasse 2 ("Atemluftfüllstation" / "Atemluftkompressor").
 */
const ERZEUGUNG_KLASSEN = new Set([
  'atemlufterzeugung',
  'atemluftfüllstation',
  'atemluftfuellstation',
  'atemluftkompressor',
]);

function klassenSchluessel(wert?: string): string {
  return (wert ?? '').trim().toLowerCase();
}

/**
 * Die Klassenspalten des Exports auf den Typ.
 *
 * Klasse 3 entscheidet zuerst und allein über die Gerätetypen: Im Geräteexport
 * steht in Klasse 2 durchgehend "Pressluftatmer" — auch bei den 81 Masken.
 * Zöge Klasse 2 gleichberechtigt mit, wäre jede Maske ein Pressluftatmer.
 * Erst wenn Klasse 3 nichts hergibt, zählen die gröberen Klassen, und dort nur
 * die Atemlufterzeugung.
 *
 * Alles Übrige wird Zubehör: 33 der 214 Zeilen haben keine Klasse 3, und eine
 * leere Zeile stillschweigend zur Flasche zu machen wäre die gefährlichere
 * Annahme — eine Flasche taucht im Füllprotokoll auf.
 */
export function typAusKlassen(klassen: {
  klasse1?: string;
  klasse2?: string;
  klasse3?: string;
}): AtemschutzGeraetTyp {
  const ausKlasse3 = KLASSE_TYP[klassenSchluessel(klassen.klasse3)];
  if (ausKlasse3) return ausKlasse3;
  if (
    ERZEUGUNG_KLASSEN.has(klassenSchluessel(klassen.klasse1)) ||
    ERZEUGUNG_KLASSEN.has(klassenSchluessel(klassen.klasse2))
  ) {
    return 'fuellstation';
  }
  return 'zubehoer';
}

/**
 * Der Standort einer Füllstation aus dem Klartext der Bezeichnung —
 * "Atemluftfüllstation Stationär" gegen "Atemluftkompressor Mobil".
 *
 * Nur der Klartext, nicht die Klasse: Ob Luft von einem Kompressor oder aus
 * einer Füllstation kommt, sagt nichts darüber, ob das Gerät fest steht oder
 * auf dem Anhänger liegt. Fehlt das Wort, bleibt der Standort offen und wird
 * im Dialog gesetzt, statt hier geraten zu werden.
 */
export function standortAusBezeichnung(
  bezeichnung: string,
): FuellstationStandort | undefined {
  const text = bezeichnung ?? '';
  if (/\bmobil/i.test(text)) return 'mobil';
  // Die Wortgrenze schützt vor "Atemluftfüllstation": dort steht kein
  // eigenständiges "stationär".
  if (/\bstation(?:ä|ae)r/i.test(text)) return 'fix';
  return undefined;
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

    // Inaktive Artikel kommen gar nicht erst in den Bestand. Sie mit
    // `active: false` anzulegen hätte dasselbe Dokument erzeugt, das der
    // Sammelplatz ohnehin überall ausblendet — nur eben eines, das bei jedem
    // Import wieder mitgeschrieben wird.
    if (
      feld(row, ARTIKEL_SPALTEN.status).toLowerCase() === STATUS_INAKTIV
    ) {
      continue;
    }

    const werte = werteAusBezeichnung(bezeichnung);
    const typ = typAusKlassen({
      klasse1: feld(row, ARTIKEL_SPALTEN.klasse1),
      klasse2: feld(row, ARTIKEL_SPALTEN.klasse2),
      klasse3: feld(row, ARTIKEL_SPALTEN.klasse3),
    });
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
      // Immer aktiv — inaktive Zeilen sind oben übersprungen worden.
      active: true,
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

    // Volumen und Nenndruck nur für Flaschen: Bei einer Maske wären sie eine
    // Erfindung, und die Ableitung aus dem Klartext greift daneben — „300
    // l/min" ist die Förderleistung eines Kompressors und keine 300-l-Flasche.
    if (typ === 'flasche') {
      if (werte.volumenLiter) geraet.volumenLiter = werte.volumenLiter;
      geraet.nenndruck = nenndruckAusBemerkung(bemerkung) ?? 300;
    }

    // Standort nur für Füllstationen — an einer Flasche hat das Feld keine
    // Bedeutung, und "mobil" im Klartext hieße dort etwas anderes.
    if (typ === 'fuellstation') {
      const standort = standortAusBezeichnung(bezeichnung);
      if (standort) geraet.standort = standort;
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
 * Verlässlichkeit: Die Sybos-ID ist der Schlüssel des Quellsystems, die
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
    // führende. Die übrigen 32 haben eine eigene Sybos-ID und landen sauber
    // in eigenen Dokumenten — sie zum Überspringen vorzuschlagen hieße, ein
    // Sechstel des Bestands beim Import zu verlieren.
    const primaer = `${kennungen[0].feld}:${kennungen[0].value}`;
    if (gesehen.has(primaer)) zeile.duplicateInFile = true;
    gesehen.add(primaer);

    return zeile;
  });
}
