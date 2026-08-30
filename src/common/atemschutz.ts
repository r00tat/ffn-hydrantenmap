/**
 * Atemschutzsammelplatz — Typen und Entscheidungslogik.
 *
 * Alles hier ist rein und ohne Firestore: dieselbe Bauweise wie
 * `common/fahrtenbuch.ts`. Stammdaten und Füllprotokoll liegen je Gruppe,
 * Trupps und Ausgaben je Einsatz — beide Seiten brauchen dieselben Typen, und
 * der Client soll für eine Codesuche keinen Serverpfad ziehen müssen.
 */

/** Subcollections unter `groups/{groupId}` — wie `vehicle` und `person`. */
export const ATEMSCHUTZ_GERAET_COLLECTION_ID = 'atemschutzGeraet';
export const ATEMSCHUTZ_FUELLUNG_COLLECTION_ID = 'atemschutzFuellung';

/** Subcollections unter `call/{firecallId}`. */
export const ATEMSCHUTZ_TRUPP_COLLECTION_ID = 'atemschutzTrupp';
export const ATEMSCHUTZ_AUSGABE_COLLECTION_ID = 'atemschutzAusgabe';

/**
 * Vorgabe für den Enddruck. 300 bar ist der Regelfall; 200-bar-Flaschen gibt
 * es weiterhin, deshalb ist das Feld im Dialog änderbar und nicht abgeleitet.
 */
export const DEFAULT_ENDDRUCK = 300;

/** Obergrenze der Sammelerfassung — ein Riegel gegen einen Tippfehler. */
export const MAX_FUELLUNG_ANZAHL = 99;

/** Höchstzahl der Truppmitglieder. Drei ist der Regelfall, vier kommt vor. */
export const MAX_TRUPP_MITGLIEDER = 4;

export type AtemschutzGeraetTyp =
  | 'flasche'
  | 'maske'
  | 'pressluftatmer'
  | 'zubehoer'
  | 'fuellstation';

export const ATEMSCHUTZ_GERAET_TYPEN: AtemschutzGeraetTyp[] = [
  'flasche',
  'maske',
  'pressluftatmer',
  'zubehoer',
  'fuellstation',
];

/** Wo eine Füllstation steht. `mobil` heißt: auf einem Fahrzeug verladen. */
export type FuellstationStandort = 'fix' | 'mobil';

export const FUELLSTATION_STANDORTE: FuellstationStandort[] = ['fix', 'mobil'];

export type Sichtkontrolle = 'offen' | 'ok' | 'mangel';

export const SICHTKONTROLLE_WERTE: Sichtkontrolle[] = ['offen', 'ok', 'mangel'];

/**
 * Vorbelegung der Sichtkontrolle.
 *
 * „In Ordnung" und nicht „offen": Wer eine Flasche in die Hand nimmt, um sie zu
 * füllen oder auszugeben, sieht sie dabei an — der Regelfall ist die
 * unauffällige Flasche. Stünde „offen" vorbelegt, wären am Ende des Einsatzes
 * fast alle Zeilen „offen" und die Angabe damit wertlos. „Offen" bleibt
 * wählbar für den Fall, dass wirklich niemand hingesehen hat.
 */
export const DEFAULT_SICHTKONTROLLE: Sichtkontrolle = 'ok';

export interface AtemschutzGeraet {
  id?: string;
  typ: AtemschutzGeraetTyp;
  /** Klartext aus dem Export, z.B. "Atemluftflasche CFK 6,8 l". */
  bezeichnung: string;
  /** "Neusiedl am See" | "Bezirksreserve" — die besitzende Feuerwehr. */
  feuerwehr: string;
  /** Die Flaschennummer der ASSP-Liste, z.B. "2.16.19". */
  nummer?: string;
  inventarNr?: string;
  zusatzInventarNr?: string;
  seriennummer?: string;
  /** ID aus dem Fremdsystem (Sybos), z.B. "96176". */
  externeId?: string;
  /**
   * Gepflegte oder angelernte Codes. Eine Liste, weil die Exportspalte
   * "Barcodes" heißt und mehrere Codes je Stück tragen kann — und weil ein am
   * Gerät angelernter Code neben einen aus dem Export treten soll.
   */
  barcodes?: string[];
  nenndruck?: number;
  volumenLiter?: number;
  material?: string;
  hersteller?: string;
  baujahr?: number;
  active: boolean;
  bemerkung?: string;
  /** Nur bei `typ === 'fuellstation'`. */
  standort?: FuellstationStandort;
  /** Nur bei `standort === 'mobil'` — der Atemschutzanhänger. */
  vehicleId?: string;
  /** Kopie, damit die Anzeige ohne Join auskommt. */
  vehicleName?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AtemschutzFuellung {
  id?: string;
  /** Verweis in die Stammdaten, wenn die Flasche erkannt wurde. */
  geraetId?: string;
  flaschenNummer?: string;
  feuerwehr?: string;
  /** 1 im Regelfall; >1 ist die Sammelerfassung ohne Nummern. */
  anzahl: number;
  startdruck?: number;
  enddruck: number;
  gefuelltVon: string;
  zeitpunkt: string;
  sichtkontrolle?: Sichtkontrolle;
  /** Verweis in `groups/{groupId}/mangel` — gesetzt, wenn die Sichtkontrolle
   *  einen Mangel ergab und er gleich hier erfasst wurde. */
  mangelId?: string;
  bemerkung?: string;
  /**
   * Einsatzbezug. `''` heißt: an der Station gefüllt, ohne Einsatz.
   *
   * Immer gesetzt, leer statt fehlend: Firestore kann nicht auf „Feld fehlt"
   * abfragen, und *Ohne Einsatz* soll ein gewöhnlicher Filter sein.
   */
  firecallId: string;
  /** Kopie des Einsatznamens — die Zeile soll ohne Join lesbar bleiben. */
  firecallName?: string;
  fuellstationId?: string;
  /** Kopie, aus demselben Grund. */
  fuellstationName?: string;
  /**
   * Ist diese Füllung der Feuerwehr zu verrechnen? Immer gesetzt, damit
   * `where('verrechnen','==',true)` nichts übersieht.
   */
  verrechnen: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type TruppStatus = 'bereit' | 'imEinsatz' | 'zurueck' | 'abgemeldet';

export const TRUPP_STATUSES: TruppStatus[] = [
  'bereit',
  'imEinsatz',
  'zurueck',
  'abgemeldet',
];

/**
 * Eine Bereitstellung eines Trupps — nicht der Trupp selbst.
 *
 * Wird ein zurückgekehrter Trupp erneut bereitgestellt, entsteht ein *neues*
 * Dokument mit demselben `truppKey`. Die alte Zeile bleibt unverändert stehen:
 * Zwischen zwei Einsätzen wird gefüllt, und ein überschriebener Druck verlöre
 * genau den Verlauf, den das Protokoll belegen soll.
 */
export interface AtemschutzTrupp {
  id?: string;
  /** Stabil über alle Zeilen desselben Trupps. */
  truppKey: string;
  /** 1., 2., 3. Bereitstellung dieses Trupps. */
  laufendeNummer: number;
  truppName?: string;
  feuerwehr: string;
  mitglieder: string[];
  status: TruppStatus;
  bereitSeit: string;
  /** Der Gruppenkommandant, zu dem der Trupp geschickt wird. */
  entsendetAn?: string;
  abmarschZeit?: string;
  /** Geringster Druck im Trupp beim Abmarsch. */
  druckAbmarsch?: number;
  rueckkehrZeit?: string;
  /** Geringster Druck im Trupp bei der Rückkehr. */
  druckRueckkehr?: number;
  bemerkung?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type AusgabeStatus = 'amPlatz' | 'ausgegeben' | 'zurueck';

export interface AtemschutzAusgabe {
  id?: string;
  geraetId: string;
  /** Kopie des Namens — die Liste soll ohne Join lesbar sein. */
  geraetName: string;
  status: AusgabeStatus;
  /** Truppname oder Feuerwehr. */
  ausgegebenAn?: string;
  ausgabeZeit?: string;
  ruecknahmeZeit?: string;
  sichtkontrolle?: Sichtkontrolle;
  /** Verweis in `groups/{groupId}/mangel`. */
  mangelId?: string;
  bemerkung?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Vereinheitlicht einen Code für den Vergleich: Großschreibung, und alles
 * entfernt, was je nach Quelle mal steht und mal nicht — Punkte, Bindestriche,
 * Schrägstriche, Leerzeichen. `AF-2.16.19`, `af 2.16.19` und `2.16.19` sollen
 * dieselbe Flasche treffen, weil sie in Export, Aufdruck und Liste genau so
 * unterschiedlich geschrieben stehen.
 */
export function normalizeCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[\s.\-/_]/g, '');
}

/**
 * Alle Kennungen eines Geräts, über die ein Scan treffen darf.
 *
 * `barcodes` steht bewusst mit drin, obwohl die Spalte im heutigen Export fast
 * leer ist: sobald sie gepflegt wird, soll ein Scan darüber treffen, ohne dass
 * hier etwas nachgezogen werden muss.
 */
export function lookupKeys(g: AtemschutzGeraet): string[] {
  const raw = [
    ...(g.barcodes ?? []),
    g.nummer,
    g.inventarNr,
    g.zusatzInventarNr,
    g.seriennummer,
    g.externeId,
  ];
  const keys = raw
    .map((value) => normalizeCode(value ?? ''))
    .filter((value) => value.length > 0);
  return [...new Set(keys)];
}

/**
 * Alle Geräte, auf die ein gescannter oder getippter Code passt.
 *
 * Gibt eine Liste zurück und nicht ein Gerät: Eine EAN-13 bezeichnet den
 * Artikeltyp, nicht das einzelne Stück — sobald die Barcode-Spalte gepflegt
 * ist, können sich mehrere Flaschen einen Code teilen. Der Dialog fragt dann
 * nach, statt still den ersten Treffer zu nehmen.
 */
export function findByCode(
  geraete: AtemschutzGeraet[],
  raw: string,
): AtemschutzGeraet[] {
  const needle = normalizeCode(raw);
  if (!needle) return [];
  return geraete.filter((g) => lookupKeys(g).includes(needle));
}

/** Vorgabe für die Trefferzahl der Suche — eine Liste, die man überblickt. */
export const MATCH_LIMIT = 30;

/**
 * Suche über *alle* Kennungen, die Bezeichnung und die Feuerwehr.
 *
 * Der Unterschied zu `findByCode`: Dort wird ein vollständiger Code exakt
 * getroffen (ein Scan liefert den ganzen Code), hier reicht ein Teilstück.
 * Wer am Sammelplatz von Hand eingibt, hat oft nur den Anfang der Nummer im
 * Kopf — oder nur die Wehr, von der die Flasche kommt.
 *
 * Kennungen werden normalisiert verglichen (`2-16-19` findet `2.16.19`),
 * Bezeichnung und Feuerwehr dagegen als Klartext ohne Trennzeichenabbau: In
 * „Neusiedl am See" sind die Leerzeichen Teil des Wortes.
 */
export function matchGeraete(
  geraete: AtemschutzGeraet[],
  query: string,
  limit = MATCH_LIMIT,
): AtemschutzGeraet[] {
  const roh = (query ?? '').trim();
  if (!roh) return geraete.slice(0, limit);

  const code = normalizeCode(roh);
  const text = roh.toLowerCase();

  const treffer = geraete.filter((g) => {
    if (code && lookupKeys(g).some((key) => key.includes(code))) return true;
    if (g.feuerwehr?.toLowerCase().includes(text)) return true;
    return g.bezeichnung?.toLowerCase().includes(text);
  });
  return treffer.slice(0, limit);
}

/**
 * Die führende Kennung eines Geräts — die, unter der es am Sammelplatz
 * angesprochen wird.
 *
 * Die Reihenfolge ist die der Lesbarkeit am Stück: Die Flaschennummer steht
 * groß auf der Flasche, die Inventarnummer klein auf dem Etikett, die
 * Seriennummer eingeprägt am Hals. Fehlt alles drei, gibt es keine Kennung —
 * dann bleibt nur die Bezeichnung, und die ist Sache des Aufrufers.
 */
export function geraetKennung(g: AtemschutzGeraet): string | undefined {
  return g.nummer ?? g.inventarNr ?? g.seriennummer ?? undefined;
}

/** Einzeiliges Etikett eines Geräts für Auswahllisten. */
export function geraetLabel(g: AtemschutzGeraet): string {
  const kopf = geraetKennung(g);
  return kopf ? `${kopf} · ${g.bezeichnung}` : g.bezeichnung;
}

/**
 * Die Zeile unter dem Etikett: woran man erkennt, dass es *dieses* Stück ist.
 *
 * Die Bezeichnung steht vorn, weil eine Nummer allein nicht sagt, ob eine
 * 6-Liter-Stahlflasche oder eine 6,8-Liter-CFK gemeint ist.
 */
export function geraetDetails(g: AtemschutzGeraet): string {
  return [g.bezeichnung, g.feuerwehr, g.inventarNr, g.seriennummer]
    .filter(Boolean)
    .join(' · ');
}

/** Die Eingabe des Dialogs. Systemfelder stehen bewusst nicht darin. */
export interface FuellungInput {
  geraetId?: string;
  flaschenNummer?: string;
  feuerwehr?: string;
  anzahl: number;
  startdruck?: number;
  enddruck: number;
  gefuelltVon: string;
  sichtkontrolle?: Sichtkontrolle;
  /** Der bei der Sichtkontrolle gleich mit erfasste Mangel. */
  mangelId?: string;
  bemerkung?: string;
  /** Ohne Angabe setzt der Aufrufer die aktuelle Zeit. */
  zeitpunkt?: string;
  fuellstationId?: string;
  fuellstationName?: string;
  /** Pflichtfeld ohne Vorgabe im Typ: Der Dialog leitet den Wert aus
   *  `verrechnenVorgabe` ab und schickt ihn immer mit. */
  verrechnen: boolean;
}

/**
 * Harte Validierung. Liefert eine Liste von Fehlerschlüsseln; leer heißt
 * gültig — dieselbe Bauweise wie `validateMangelInput`.
 *
 * Bewusst wenig: Am Sammelplatz zählt Tempo. Ein Startdruck, den niemand
 * abgelesen hat, darf die Eingabe nicht blockieren; nur ein Startdruck *über*
 * dem Enddruck ist sicher falsch.
 */
export function validateFuellungInput(input: FuellungInput): string[] {
  const errors: string[] = [];
  const hatNummer = !!input.flaschenNummer?.trim();
  const hatFeuerwehr = !!input.feuerwehr?.trim();
  if (!hatNummer && !hatFeuerwehr) errors.push('identifierMissing');

  if (
    !Number.isInteger(input.anzahl) ||
    input.anzahl < 1 ||
    input.anzahl > MAX_FUELLUNG_ANZAHL
  ) {
    errors.push('anzahlInvalid');
  }

  if (!Number.isFinite(input.enddruck) || input.enddruck <= 0) {
    errors.push('enddruckInvalid');
  } else if (
    typeof input.startdruck === 'number' &&
    Number.isFinite(input.startdruck) &&
    input.startdruck > input.enddruck
  ) {
    errors.push('startdruckAboveEnddruck');
  }

  if (!input.gefuelltVon?.trim()) errors.push('gefuelltVonMissing');
  return errors;
}

/** Wie viele Flaschen die Liste insgesamt ausweist — `anzahl` je Zeile. */
export function fuellungenGesamt(fuellungen: AtemschutzFuellung[]): number {
  return fuellungen.reduce((sum, f) => sum + (f.anzahl || 1), 0);
}

export interface FuellstationAuswahl {
  /** `keine` = das Feld entfällt im Dialog. */
  modus: 'keine' | 'fest' | 'auswahl';
  station?: AtemschutzGeraet;
  optionen: AtemschutzGeraet[];
}

/**
 * Welche Füllstation der Dialog anbietet.
 *
 * Der Fall „keine" ist der wichtigste: Solange niemand einen Kompressor
 * angelegt hat — der Zustand jeder Feuerwehr am Tag der Auslieferung — darf
 * das Füllprotokoll nicht an einem leeren Pflichtfeld hängen.
 */
export function waehleFuellstation(
  stationen: AtemschutzGeraet[],
  letzteWahlId?: string,
): FuellstationAuswahl {
  const optionen = stationen.filter((s) => s.active !== false);
  if (optionen.length === 0) return { modus: 'keine', optionen: [] };
  if (optionen.length === 1) {
    return { modus: 'fest', station: optionen[0], optionen };
  }
  const letzte = letzteWahlId
    ? optionen.find((s) => s.id === letzteWahlId)
    : undefined;
  return { modus: 'auswahl', station: letzte ?? optionen[0], optionen };
}

/**
 * Vorbelegung des Verrechnen-Schalters beim *Anlegen* einer Füllung.
 *
 * Im Einsatz immer aus: Dort ist das Nachbarschaftshilfe, keine
 * Dienstleistung. An der Station wird verrechnet, was für eine andere
 * Feuerwehr gefüllt wurde.
 *
 * Der Vergleich läuft über `normalizeCode` — dieselbe Vereinheitlichung wie
 * bei den Gerätekennungen. „Neusiedl am See" und „neusiedl-am-see" sind
 * dieselbe Feuerwehr; sie unterschiedlich zu behandeln wäre für den Benutzer
 * nicht nachvollziehbar.
 */
export function verrechnenVorgabe(args: {
  feuerwehr?: string;
  firecallId: string;
  eigeneFeuerwehr?: string;
}): boolean {
  if (args.firecallId) return false;
  const fremd = args.feuerwehr?.trim();
  const eigen = args.eigeneFeuerwehr?.trim();
  if (!fremd || !eigen) return false;
  return normalizeCode(fremd) !== normalizeCode(eigen);
}

/**
 * Erlaubte Zustandswechsel *innerhalb* einer Zeile.
 *
 * `zurueck` ist ein Endzustand: Ein regenerierter Trupp bekommt eine neue
 * Zeile (`nextBereitstellung`), damit die alte als Nachweis stehen bleibt.
 * `imEinsatz → abgemeldet` fehlt bewusst — ein Trupp, der draußen ist, muss
 * erst zurückkommen, sonst behauptet das Protokoll, niemand sei mehr im
 * Einsatz.
 */
const TRANSITIONS: Record<TruppStatus, TruppStatus[]> = {
  bereit: ['imEinsatz', 'abgemeldet'],
  imEinsatz: ['zurueck'],
  zurueck: ['abgemeldet'],
  abgemeldet: [],
};

export function canTransition(from: TruppStatus, to: TruppStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface EntsendeInput {
  /**
   * Fahrzeug oder Gruppenkommandant, dem der Trupp unterstellt wird.
   *
   * Optional: Am Sammelplatz steht oft nur fest, *dass* der Trupp abmarschiert
   * — wohin, klärt sich auf dem Weg. Ein Pflichtfeld führte hier zu einem
   * erfundenen Eintrag oder zu gar keiner Protokollzeile.
   */
  entsendetAn?: string;
  abmarschZeit: string;
  /** Geringster Druck im Trupp; fehlt, wenn niemand abgelesen hat. */
  druckAbmarsch?: number;
}

export type TruppPatch = Partial<AtemschutzTrupp> & { status: TruppStatus };

export function entsendePatch(input: EntsendeInput): TruppPatch {
  const patch: TruppPatch = {
    status: 'imEinsatz',
    abmarschZeit: input.abmarschZeit,
  };
  const ziel = input.entsendetAn?.trim();
  if (ziel) patch.entsendetAn = ziel;
  // Nicht `patch.druckAbmarsch = input.druckAbmarsch`: Firestore lehnt
  // `undefined` ab — dieselbe Vorsicht wie in `buildMangelDocument`.
  if (typeof input.druckAbmarsch === 'number') {
    patch.druckAbmarsch = input.druckAbmarsch;
  }
  return patch;
}

export interface RueckkehrInput {
  rueckkehrZeit: string;
  druckRueckkehr?: number;
}

export function rueckkehrPatch(input: RueckkehrInput): TruppPatch {
  const patch: TruppPatch = {
    status: 'zurueck',
    rueckkehrZeit: input.rueckkehrZeit,
  };
  if (typeof input.druckRueckkehr === 'number') {
    patch.druckRueckkehr = input.druckRueckkehr;
  }
  return patch;
}

/** Die Basisdaten einer neuen Zeile — ohne Systemfelder, die der Store setzt. */
export type NeueBereitstellung = Omit<
  AtemschutzTrupp,
  'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
>;

/**
 * Stellt einen zurückgekehrten Trupp erneut bereit — als *neue* Zeile.
 *
 * Übernommen wird nur, was den Trupp ausmacht: Schlüssel, Name, Feuerwehr,
 * Mitglieder. Zeiten, Drücke, Gruppenkommandant und Bemerkung der alten Zeile
 * bleiben dort und werden hier nicht mitgeschleppt — sonst behauptete die neue
 * Bereitstellung einen Abmarsch, den es noch nicht gab.
 */
export function nextBereitstellung(
  vorherige: AtemschutzTrupp,
  jetzt: string,
): NeueBereitstellung {
  const neu: NeueBereitstellung = {
    truppKey: vorherige.truppKey,
    laufendeNummer: vorherige.laufendeNummer + 1,
    feuerwehr: vorherige.feuerwehr,
    mitglieder: [...vorherige.mitglieder],
    status: 'bereit',
    bereitSeit: jetzt,
  };
  if (vorherige.truppName) neu.truppName = vorherige.truppName;
  return neu;
}

export interface TruppGruppen {
  bereit: AtemschutzTrupp[];
  imEinsatz: AtemschutzTrupp[];
  zurueck: AtemschutzTrupp[];
  /**
   * Je Trupp die jüngste Bereitstellung — auch die abgemeldeten. Nur an diesen
   * Zeilen darf der Zustand noch geändert werden: Eine ältere Zeile im
   * Protokoll ist Nachweis und kein Trupp, der noch irgendwo steht.
   */
  aktuell: AtemschutzTrupp[];
  /** Alle Zeilen, neueste Bereitstellung zuerst. */
  protokoll: AtemschutzTrupp[];
}

/**
 * Wie ein Trupp genannt wird: Feuerwehr zuerst, dann sein Name.
 *
 * Am Sammelplatz stehen Trupps mehrerer Wehren, und „Trupp 1" gibt es dann
 * mehrfach. Die Wehr steht deshalb vorn und nicht klein darunter.
 */
export function truppLabel(trupp: AtemschutzTrupp): string {
  return [trupp.feuerwehr, trupp.truppName].filter(Boolean).join(' ').trim();
}

/**
 * Teilt die Zeilen in die drei Abschnitte der Oberfläche und das Protokoll.
 *
 * Zwei Regeln, die verhindern, dass ein Trupp doppelt am Sammelplatz steht:
 *
 * - **Je Trupp zählt oben nur die jüngste Bereitstellung.** Ein Trupp, der
 *   zurückgekommen und danach erneut hinausgegangen ist, hat zwei Zeilen: die
 *   alte auf `zurueck`, die neue auf `imEinsatz`. Ohne diese Regel stünde er
 *   gleichzeitig unter „Im Einsatz" und unter „Zurück & Regeneration" — und
 *   wer auf die Tafel schaut, zählt einen Trupp zu viel. Die alte Zeile bleibt
 *   im Protokoll, wo sie als Nachweis hingehört.
 * - **Abgemeldete stehen nur im Protokoll.** Sie sind heimgefahren, und eine
 *   vierte Karte für Leute, die nicht mehr da sind, hilft niemandem.
 */
export function gruppiereTrupps(trupps: AtemschutzTrupp[]): TruppGruppen {
  const protokoll = [...trupps].sort((a, b) =>
    (b.bereitSeit ?? '').localeCompare(a.bereitSeit ?? ''),
  );

  // `laufendeNummer` entscheidet und nicht die Reihenfolge der Liste: Zwei
  // Bereitstellungen können in derselben Sekunde angelegt worden sein.
  const juengste = new Map<string, AtemschutzTrupp>();
  for (const t of protokoll) {
    const key = t.truppKey || (t.id ?? '');
    const bisher = juengste.get(key);
    if (!bisher || (t.laufendeNummer ?? 0) > (bisher.laufendeNummer ?? 0)) {
      juengste.set(key, t);
    }
  }
  const aktuell = protokoll.filter(
    (t) => juengste.get(t.truppKey || (t.id ?? '')) === t,
  );

  return {
    bereit: aktuell.filter((t) => t.status === 'bereit'),
    imEinsatz: aktuell.filter((t) => t.status === 'imEinsatz'),
    zurueck: aktuell.filter((t) => t.status === 'zurueck'),
    aktuell,
    protokoll,
  };
}

/** Die Eingabe des Trupp-Dialogs. */
export interface TruppInput {
  truppName?: string;
  feuerwehr: string;
  mitglieder: string[];
  bemerkung?: string;
}

/**
 * Bereinigt eine Namensliste: Randleerzeichen weg, Leeres raus, Dubletten raus,
 * auf `max` gekürzt.
 *
 * Die Dublettenprüfung vergleicht ohne Rücksicht auf Groß- und Kleinschreibung,
 * behält aber die zuerst eingegebene Schreibweise: Wer denselben Namen zweimal
 * in das Chip-Feld tippt, meint eine Person, nicht zwei.
 */
export function sanitizePersonen(namen: string[], max?: number): string[] {
  const gesehen = new Set<string>();
  const result: string[] = [];
  for (const roh of namen ?? []) {
    const name = (roh ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    result.push(name);
    if (max != null && result.length >= max) break;
  }
  return result;
}

/**
 * Wie `sanitizePersonen`, mit der Höchstzahl eines Trupps.
 */
export function sanitizeMitglieder(mitglieder: string[]): string[] {
  return sanitizePersonen(mitglieder, MAX_TRUPP_MITGLIEDER);
}

/**
 * Harte Validierung des Trupps.
 *
 * Bewusst *keine* Forderung nach genau drei Namen: Ein Sicherheitstrupp aus
 * zweien und ein einzelner Melder kommen vor, und ein Formular, das den
 * Regelfall zur Vorschrift macht, zwingt am Sammelplatz zu Falscheingaben.
 */
export function validateTruppInput(input: TruppInput): string[] {
  const errors: string[] = [];
  if (!input.feuerwehr?.trim()) errors.push('feuerwehrMissing');
  if (sanitizeMitglieder(input.mitglieder).length === 0) {
    errors.push('mitgliederMissing');
  }
  return errors;
}

/**
 * Ein neuer `truppKey`. `crypto.randomUUID` ist im Browser und in Node 19+
 * vorhanden; der Fallback deckt einen alten WebView ab, in dem der Wert nur
 * innerhalb eines Einsatzes eindeutig sein muss.
 */
export function newTruppKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
