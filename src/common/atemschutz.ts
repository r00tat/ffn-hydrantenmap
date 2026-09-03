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

/**
 * Anlass einer Füllung.
 *
 * `firecallId` allein reicht dafür nicht: Ohne Einsatz sind Übung und
 * Stationsfüllung beide „ohne Einsatz", und für die Jahresauswertung ist genau
 * das der Unterschied, der zählt. Drei Werte und nicht mehr — jeder weitere
 * müsste am Sammelplatz in derselben Sekunde entschieden werden, in der die
 * Flasche am Kompressor hängt.
 */
export type FuellungZweck = 'einsatz' | 'uebung' | 'sonstiges';

export const FUELLUNG_ZWECKE: FuellungZweck[] = [
  'einsatz',
  'uebung',
  'sonstiges',
];

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
  /**
   * Anlass der Füllung. **Optional**, anders als `verrechnen`: Die Zeilen aus
   * der Zeit vor diesem Feld haben keinen, und der Filter läuft ohnehin
   * clientseitig auf der geladenen Liste. Wer den Wert braucht, nimmt
   * `zweckOf` — das leitet ihn für Altzeilen aus `firecallId` ab.
   */
  zweck?: FuellungZweck;
  /**
   * Verweis in `groups/{groupId}/atemschutzRechnung` — gesetzt heißt
   * abgerechnet.
   *
   * Anders als `verrechnen` **optional** und nicht immer gesetzt: Die
   * Verrechnungsübersicht fragt `where('verrechnen','==',true)` ab und filtert
   * `rechnungId` clientseitig. Das erspart eine Migration aller Bestandszeilen
   * und einen weiteren zusammengesetzten Index — dieselbe Abwägung wie beim
   * Verrechnen-Filter im Füllprotokoll.
   */
  rechnungId?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Der Zustand einer Bereitstellung.
 *
 * `zugeteilt` steht zwischen `bereit` und `imEinsatz`: Wird ein Trupp vom
 * Sammelplatz entsendet, ist er einer taktischen Einheit **zugeordnet und in
 * Vorbereitung**, aber noch nicht unter Atemschutz. Der Sammelplatz weiß gar
 * nicht, wann er es wird — das entscheidet die Einheit mit dem Einsatzauftrag.
 *
 * Warum das ein eigener Zustand sein muss und nicht bloß eine Beschriftung:
 * `abmarschZeit` ist der Ankerpunkt jeder Rechnung der Zeitkontrolle. Wurde er
 * schon bei der Übergabe gesetzt, liefen Drittelmarken, gemessener Verbrauch
 * und Rückzugszeitpunkt, während der Trupp noch anlegt — ein um 10:00
 * übergebener Trupp, der um 10:20 anschließt, bekam seine Warnungen zwanzig
 * Minuten zu früh.
 */
export type TruppStatus =
  | 'bereit'
  | 'zugeteilt'
  | 'imEinsatz'
  | 'zurueck'
  | 'abgemeldet';

export const TRUPP_STATUSES: TruppStatus[] = [
  'bereit',
  'zugeteilt',
  'imEinsatz',
  'zurueck',
  'abgemeldet',
];

/**
 * Vorlagen für den Gerätesatz eines Trupps, benannt nach der Lehrunterlage.
 *
 * Nur die drei Sätze, die FH-06 selbst durchrechnet, plus `custom`: Jeder
 * weitere Eintrag wäre eine Behauptung darüber, was eine Feuerwehr fährt, und
 * mit `custom` steht der Weg zu beliebigen Werten ohnehin offen.
 */
export type PaTypKey = 'standard200' | 'standard300' | 'langzeit300' | 'custom';

export const PA_TYPEN: PaTypKey[] = [
  'standard200',
  'standard300',
  'langzeit300',
  'custom',
];

/** Was den Luftvorrat eines Trupps bestimmt. */
export interface Geraetesatz {
  /** Flaschen je Geräteträger. */
  flaschenAnzahl: number;
  /** Volumen *einer* Flasche in Liter. */
  flaschenVolumen: number;
  /** Nenndruck in bar — entscheidet über den Korrekturfaktor. */
  fuellDruck: number;
}

/**
 * Die Gerätesätze der Beispiele aus FH-06, S. 48-49.
 *
 * `custom` fehlt hier bewusst: Dafür gibt es keine Vorlage, sondern die Werte
 * am Trupp.
 */
export const PA_SAETZE: Record<Exclude<PaTypKey, 'custom'>, Geraetesatz> = {
  // Standardpressluftatmer, 2-Flaschengerät á 4 l mit 200 bar.
  standard200: { flaschenAnzahl: 2, flaschenVolumen: 4, fuellDruck: 200 },
  // Standardpressluftatmer, 1-Flaschengerät á 6 l mit 300 bar.
  standard300: { flaschenAnzahl: 1, flaschenVolumen: 6, fuellDruck: 300 },
  // Langzeitpressluftatmer, 2-Flaschengerät á 6,8 l mit 300 bar.
  langzeit300: { flaschenAnzahl: 2, flaschenVolumen: 6.8, fuellDruck: 300 },
};

/**
 * Eine protokollierte Druckabfrage.
 *
 * Maßgeblich ist immer der **geringste Druck im Trupp**: „Der Atemschutztrupp
 * hat sich bei der Festlegung des Rückmarschzeitpunktes immer an dem
 * Geräteträger mit dem größten Luftverbrauch zu orientieren." (FH-06 5.3.2)
 * Deshalb ein Wert je Abfrage und nicht einer je Person — drei Werte
 * abzufragen kostet Funkzeit, und gerechnet würde ohnehin nur mit dem
 * kleinsten.
 */
export interface Druckabfrage {
  zeitpunkt: string;
  /**
   * Geringster Druck im Trupp in bar.
   *
   * **Optional**, seit derselbe Dialog auch eine Statusmeldung aufnimmt: Über
   * Funk kommt nicht jede Meldung mit einer Zahl — „starke Verrauchung, wir
   * arbeiten weiter" ist eine Meldung ohne Druck. Alles, was rechnet, lässt
   * solche Zeilen aus (`berechneStand`, `baueDruckVerlauf`): Sie sind ein
   * Ereignis, kein Messpunkt.
   */
  druck?: number;
  /**
   * Die Ankunft am Einsatzziel — in der Unterlage „Flaschendruck bei Erreichen
   * des Einsatzzieles".
   *
   * Ohne sie ist der Rückmarschdruck aus dem doppelten Vormarschdruckabfall
   * nicht berechenbar — sie ist der einzige Wert, aus dem hervorgeht, wie viel
   * Luft der Hinweg gekostet hat. In der Oberfläche heißt das Feld deshalb
   * „Trupp ist am Einsatzziel angekommen" und ist **nicht** vorbelegt:
   * „Einsatzziel erreicht" liest sich wie „Auftrag erledigt", und ein zu früh
   * gesetzter Haken macht den Rückmarschdruck zu einer Behauptung.
   */
  amZiel?: boolean;
  /**
   * Der Trupp hat den Rückzug angetreten — die Gegenmeldung zur Ankunft.
   *
   * Am Ende der Zeitkontrolle stand vorher nur „angekommen" und dann irgendwann
   * „zurück". Der Rückmarsch ist aber ein eigener Abschnitt: Ab hier laufen die
   * Fristen ins Leere, denn ihr Zweck war, den Trupp zum Umkehren zu bringen.
   * Deshalb schweigen die Warnungen danach (`faelligeWarnungen`) — beobachtet
   * wird noch der Reservedruck.
   *
   * Ein Feld an der Abfrage und kein Zeitstempel am Trupp: Die Meldung „wir
   * kommen zurück" kommt über Funk zusammen mit einem Flaschendruck, und genau
   * dieses Paar ist eine Druckabfrage. Ein eigenes Feld am Trupp wäre eine
   * zweite Wahrheit über denselben Funkspruch.
   */
  rueckzug?: boolean;
  bemerkung?: string;
  /** Wer abgefragt hat — `uid`, für die Nachvollziehbarkeit. */
  erfasstVon?: string;
}

/**
 * Ein Gerät am Trupp.
 *
 * `geraetId` fehlt bei einer Fremdflasche ohne Stammdatensatz; dann tragen
 * `bezeichnung` und `kennung` allein. Dieselbe Abwägung wie beim Füllprotokoll:
 * Ein Pflichtverweis in die Stammdaten hieße, dass eine Nachbarwehr nicht
 * erfassbar ist.
 */
export interface TruppGeraet {
  geraetId?: string;
  typ: AtemschutzGeraetTyp;
  bezeichnung: string;
  /** Flaschennummer, Inventar- oder Seriennummer — was aufgedruckt ist. */
  kennung?: string;
  /**
   * Wer das Gerät getragen hat.
   *
   * Wird meist erst bei der Rückkehr nachgetragen: Beim Abmarsch steht selten
   * fest, wer welche Flasche aufnimmt, und ein Pflichtfeld hier hielte den
   * Trupp auf.
   */
  person?: string;
}

/**
 * Die Warnungen der Überwachung, in der Reihenfolge ihrer Dringlichkeit.
 *
 * `drittel` und `zweiDrittel` sind Erinnerungen, `rueckzug` ist die
 * sicherheitsrelevante Warnung — die Reihenfolge entscheidet, welche verschickt
 * wird, wenn mehrere gleichzeitig fällig sind.
 */
export type WarnungKey = 'drittel' | 'zweiDrittel' | 'rueckzug';

export const WARNUNG_KEYS: WarnungKey[] = ['drittel', 'zweiDrittel', 'rueckzug'];

/**
 * Die Ereignisse, die genau einmal je Bereitstellung ins Einsatztagebuch
 * gehen. Der Zustandswechsel bzw. die erste Meldung löst sie aus.
 */
export type TagebuchEreignis = 'auftrag' | 'amZiel' | 'rueckzug' | 'rueckkehr';

export const TAGEBUCH_EREIGNISSE: TagebuchEreignis[] = [
  'auftrag',
  'amZiel',
  'rueckzug',
  'rueckkehr',
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
  /**
   * Wann der Sammelplatz den Trupp der taktischen Einheit übergeben hat.
   *
   * Getrennt von `abmarschZeit`, siehe `TruppStatus`: Der Sammelplatz weiß
   * nicht, wann der Trupp anschließt, und an `abmarschZeit` hängt jede
   * Rechnung der Zeitkontrolle.
   */
  uebergabeZeit?: string;
  /** Geringster Druck im Trupp bei der Übergabe. Optional wie `druckAbmarsch`:
   *  Am Sammelplatz liest nicht immer jemand ab. */
  druckUebergabe?: number;

  // ---- Atemschutzüberwachung (Einsatzzeitkontrolle, FH-06 5.3.3) ----
  //
  // Bewusst Felder am Trupp und keine eigene Sammlung: Der Trupp am
  // Sammelplatz und der überwachte Trupp sind derselbe. Sonst müsste die
  // Übergabe ein zweites Dokument anlegen, das mit dem ersten in Zeit und
  // Druck auseinanderlaufen kann — und genau darauf käme es an.

  /**
   * Was der Trupp tun soll — „Menschenrettung", „Brandbekämpfung",
   * „Erkundung".
   *
   * Freitext neben `einsatzziel`: In FH-06 sind das die zwei Teile desselben
   * Befehls, das WAS und das WO. Eine Auswahlliste wäre eine Behauptung
   * darüber, welche Aufträge es gibt.
   */
  auftrag?: string;
  /**
   * Einsatzziel und -ort — das „WO" der Dokumentation.
   *
   * Freitext: „Stiegenhaus 3. OG", „Kellerabteil links". Keine Auswahlliste,
   * weil der Ort in der Funkmeldung genau so beschrieben wird.
   */
  einsatzziel?: string;
  /**
   * Wer die Zeitkontrolle führt, als Klartext — der Gruppenkommandant selbst
   * oder die von ihm beauftragte Person („Maschinist LFA", „Melder").
   *
   * Kein Benutzerverweis: Der Beauftragte hat oft kein Gerät in der Hand, und
   * das Protokoll soll die Funktion nennen, nicht ein Konto.
   */
  ueberwachtVon?: string;
  /**
   * Geräte, deren Benutzer eine Warnung bekommen sollen.
   *
   * Getrennt von `ueberwachtVon`: Der Push braucht eine `uid`, das Protokoll
   * einen Namen. Wer die Überwachung übernimmt oder eine Druckabfrage erfasst,
   * kommt dazu — auf einem Sammelplatz wechseln sich mehrere ab, und die
   * Warnung soll bei allen ankommen, die schon einmal daran gearbeitet haben.
   */
  ueberwachungUids?: string[];
  /**
   * Wann die Verantwortung für die Zeitkontrolle übernommen wurde.
   *
   * Der Wechsel ist protokollpflichtig: Ab hier hat der Gruppenkommandant die
   * Überwachung, nicht mehr der Sammelplatz (FH-06 5.3.4).
   */
  ueberwachungSeit?: string;
  /**
   * Wann der zurückgekehrte Trupp an den Sammelplatz übergeben wurde.
   *
   * Das Gegenstück zu `ueberwachungSeit`: Beide zusammen sind der Zeitraum, in
   * dem der Gruppenkommandant die Zeitkontrolle hatte. Danach ist der Trupp
   * Sache des Sammelplatzes — Regeneration, Flaschen füllen, neu ausrüsten —,
   * und wer die Überwachung führte, ist damit fertig.
   *
   * `ueberwachungSeit` bleibt dabei stehen: Es belegt, wann die Verantwortung
   * begann, und ein gelöschter Anfang machte das Ende unlesbar.
   */
  ueberwachungBis?: string;
  /** Vorlage des Gerätesatzes; `custom` heißt: Werte von Hand oder aus der Flasche. */
  paTyp?: PaTypKey;
  /** Zahl der Flaschen je Geräteträger. */
  flaschenAnzahl?: number;
  /** Volumen *einer* Flasche in Liter. */
  flaschenVolumen?: number;
  /** Nenndruck der Flasche in bar — entscheidet über den Korrekturfaktor. */
  fuellDruck?: number;
  /**
   * Protokollierte Druckabfragen nach dem Abmarsch, älteste zuerst.
   *
   * Ein Array und keine Untersammlung: Es sind ein paar Zeilen je
   * Bereitstellung, die Anzeige braucht immer alle, `arrayUnion` hängt atomar
   * an — und die Einsatzsicherung (`useExport`) nimmt das Feld mit, ohne dass
   * dort etwas nachgezogen werden muss.
   *
   * Der Abmarsch steht **nicht** darin: Er ist `abmarschZeit` +
   * `druckAbmarsch`. Zwei Wahrheiten über denselben Zeitpunkt wären eine zu
   * viel.
   */
  abfragen?: Druckabfrage[];
  /**
   * Geräte am Trupp — Flasche, Maske, Pressluftatmer.
   *
   * Sie hängen am Trupp und nicht an der Person: Wer welche Flasche trägt,
   * steht meist erst fest, wenn der Trupp wieder herauskommt. `person` wird
   * deshalb später nachgetragen.
   */
  truppGeraete?: TruppGeraet[];
  /**
   * Welche Warnung wann verschickt wurde.
   *
   * Steht am Dokument und nicht im Server: Der Zeitplan läuft alle Minute, und
   * ohne diese Buchführung käme jede Warnung jede Minute erneut.
   */
  warnungen?: Partial<Record<WarnungKey, string>>;
  /**
   * Welche Ereignisse dieser Bereitstellung schon im Einsatztagebuch stehen.
   *
   * Am Dokument und nicht im Code, aus demselben Grund wie `warnungen`: Zwei
   * Geräte sehen denselben Trupp, und ohne diese Buchführung entstünde der
   * Eintrag ein zweites Mal, sobald jemand einen Dialog erneut speichert.
   *
   * Die freie Statusmeldung steht nicht darin: Sie entsteht nur durch einen
   * gesetzten Haken, und ein zweiter Haken ist eine zweite Meldung.
   */
  tagebuch?: Partial<Record<TagebuchEreignis, string>>;
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
  /** Wie `verrechnen`: aus `zweckVorgabe` abgeleitet und immer mitgeschickt. */
  zweck: FuellungZweck;
  /**
   * Der Einsatzbezug, wenn der Dialog ihn zur Wahl stellt.
   *
   * Optional, weil der Sammelplatz ihn nicht zur Wahl stellt — dort steht der
   * Einsatz fest und kommt aus dem Kontext. Auf der zentralen Seite ist er
   * dagegen ein Feld des Dialogs: Ohne das übernähme eine bearbeitete Zeile
   * den *Filter* als Einsatz und verlöre ihren eigenen.
   */
  firecallId?: string;
  firecallName?: string;
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
 * Vorbelegung des Zwecks beim *Anlegen* einer Füllung.
 *
 * Mit Einsatz ist der Anlass eindeutig; ohne Einsatz bleibt „Sonstiges" und
 * nicht „Übung": Der Regelfall an der Station ist das Nachfüllen nach dem
 * Einsatz oder für den Bestand, nicht die Übung. Wer geübt hat, stellt um —
 * eine falsche Vorbelegung auf „Übung" bekäme dagegen niemand zu sehen.
 */
export function zweckVorgabe(firecallId: string): FuellungZweck {
  return firecallId ? 'einsatz' : 'sonstiges';
}

/**
 * Der Zweck einer Zeile, auch wenn sie noch keinen trägt.
 *
 * Für Zeilen aus der Zeit vor dem Feld wird er aus `firecallId` abgeleitet,
 * statt sie als „ohne Zweck" aus jedem Filter fallen zu lassen. Eine Migration
 * aller Bestandszeilen spart das ebenfalls — dieselbe Abwägung wie bei
 * `rechnungId`.
 */
export function zweckOf(
  f: Pick<AtemschutzFuellung, 'zweck' | 'firecallId'>,
): FuellungZweck {
  return f.zweck ?? zweckVorgabe(f.firecallId ?? '');
}

/**
 * Warum eine Füllung nicht mehr geändert werden darf — `undefined` heißt:
 * sie darf.
 */
export type FuellungSperre = 'verrechnet' | 'fremd';

/**
 * Wer eine bereits erfasste Füllung ändern oder löschen darf.
 *
 * Zwei Schranken, in dieser Reihenfolge:
 *
 * - **Abgerechnet ist abgerechnet.** Trägt die Zeile eine `rechnungId`, steht
 *   ihr Inhalt auf einem Beleg, der das Haus verlassen hat. Sie still zu
 *   ändern hieße, die Rechnung nachträglich zu einer Behauptung zu machen. Die
 *   Sperre gilt auch für den Gruppen-Admin: Der Weg zurück führt über das
 *   Storno der Rechnung, nicht über die Zeile.
 * - **Sonst nur der Erfasser oder ein Gruppen-Admin.** Das Füllprotokoll ist
 *   ein Nachweis; wer gefüllt hat, korrigiert seinen eigenen Tippfehler, und
 *   für alles andere gibt es den Gruppen-Admin. Vorher durfte jedes
 *   Gruppenmitglied jede fremde Zeile ändern und löschen.
 *
 * Zeilen ohne `createdBy` — es gibt sie nicht aus der App, wohl aber aus einem
 * Import von Hand — bleiben damit dem Gruppen-Admin vorbehalten. Das ist die
 * sichere Richtung: `createdBy: ''` gegen ein leeres `uid` zu vergleichen
 * gäbe sonst jedem abgemeldeten Zustand das Recht.
 */
export function fuellungSperre(args: {
  fuellung: Pick<AtemschutzFuellung, 'createdBy' | 'rechnungId'>;
  uid?: string;
  istGruppenAdmin?: boolean;
}): FuellungSperre | undefined {
  if (args.fuellung.rechnungId) return 'verrechnet';
  if (args.istGruppenAdmin) return undefined;
  const uid = args.uid?.trim();
  if (uid && args.fuellung.createdBy === uid) return undefined;
  return 'fremd';
}

/** Kurzform für die Stellen, die nur ja oder nein brauchen. */
export function darfFuellungAendern(args: {
  fuellung: Pick<AtemschutzFuellung, 'createdBy' | 'rechnungId'>;
  uid?: string;
  istGruppenAdmin?: boolean;
}): boolean {
  return fuellungSperre(args) === undefined;
}

/**
 * Ob die Liste zu einer Füllung das Datum zeigen muss.
 *
 * Am Sammelplatz sind alle Zeilen von heute und die Uhrzeit genügt; auf der
 * zentralen Seite stehen Füllungen aus Monaten untereinander und wären ohne
 * Datum nicht auseinanderzuhalten. Statt eines Schalters je Aufrufer
 * entscheidet der Zeitpunkt selbst — dann steht das Datum auch am Sammelplatz,
 * wenn ein Einsatz über Mitternacht geht, und genau dort gehört es hin.
 */
export function braucheDatum(zeitpunkt: string, jetzt: Date): boolean {
  const d = new Date(zeitpunkt);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() !== jetzt.toDateString();
}

/**
 * Erlaubte Zustandswechsel *innerhalb* einer Zeile.
 *
 * `zurueck` ist ein Endzustand: Ein regenerierter Trupp bekommt eine neue
 * Zeile (`nextBereitstellung`), damit die alte als Nachweis stehen bleibt.
 *
 * `imEinsatz → abgemeldet` und `zugeteilt → abgemeldet` fehlen bewusst — ein
 * Trupp, der draußen ist, muss erst zurückkommen, sonst behauptet das
 * Protokoll, niemand sei mehr im Einsatz. `zugeteilt → bereit` fehlt aus dem
 * Grund darüber: Zurückgenommen wird über eine neue Zeile, nicht durch
 * Umschreiben der alten.
 */
const TRANSITIONS: Record<TruppStatus, TruppStatus[]> = {
  bereit: ['zugeteilt', 'imEinsatz', 'abgemeldet'],
  zugeteilt: ['imEinsatz', 'zurueck'],
  imEinsatz: ['zurueck'],
  zurueck: ['abgemeldet'],
  abgemeldet: [],
};

export function canTransition(from: TruppStatus, to: TruppStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface ZuteilungInput {
  /** Fahrzeug oder taktische Einheit, der der Trupp unterstellt wird. */
  entsendetAn?: string;
  uebergabeZeit: string;
  /** Geringster Druck im Trupp; fehlt, wenn niemand abgelesen hat. */
  druckUebergabe?: number;
}

export type TruppPatch = Partial<AtemschutzTrupp> & { status: TruppStatus };

/**
 * Der Sammelplatz übergibt einen Trupp an eine taktische Einheit.
 *
 * Bewusst **kein** `abmarschZeit`: Das ist der Zeitpunkt des Anschließens der
 * Luftversorgung und Sache der Einheit (`entsendePatch`). Der Sammelplatz
 * bucht hier eine Ressource um, er startet keine Zeitkontrolle.
 */
export function zuteilungPatch(input: ZuteilungInput): TruppPatch {
  const patch: TruppPatch = {
    status: 'zugeteilt',
    uebergabeZeit: input.uebergabeZeit,
  };
  const ziel = input.entsendetAn?.trim();
  if (ziel) patch.entsendetAn = ziel;
  // Nicht direkt zuweisen: Firestore lehnt `undefined` ab.
  if (typeof input.druckUebergabe === 'number') {
    patch.druckUebergabe = input.druckUebergabe;
  }
  return patch;
}

export interface EntsendeInput {
  /**
   * Fahrzeug oder taktische Einheit, der der Trupp unterstellt ist.
   *
   * Optional: Bei einem Trupp, der über den Sammelplatz kam, steht sie schon
   * am Dokument, und ein leerer Wert soll sie nicht löschen.
   */
  entsendetAn?: string;
  /** „Uhrzeit beim Anschließen des Luftversorgungssystems" (FH-06). */
  abmarschZeit: string;
  /** Geringster Druck im Trupp; fehlt, wenn niemand abgelesen hat. */
  druckAbmarsch?: number;
  /** Das WAS des Befehls — „Menschenrettung". */
  auftrag?: string;
  /** Das WO — „Keller Stiegenhaus links". */
  einsatzziel?: string;
  /** Wer die Zeitkontrolle führt, als Klartext. */
  ueberwachtVon?: string;
  /**
   * Der bisherige Zustand der Zeile — für `ueberwachungSeit` und die
   * Warnliste. Optional, damit ältere Aufrufer ohne Übernahme weiterlaufen.
   */
  trupp?: Pick<AtemschutzTrupp, 'ueberwachungSeit' | 'ueberwachungUids'>;
  /** Wer losschickt; bekommt damit die Warnungen dieser Bereitstellung. */
  uid?: string;
}

/**
 * Der Einsatzauftrag der taktischen Einheit — hier geht der Trupp unter
 * Atemschutz.
 *
 * Der Patch **ist zugleich die Übernahme der Zeitkontrolle**: Wer einen Trupp
 * unter Atemschutz schickt, hat ab diesem Moment die Verantwortung (FH-06
 * 5.3.4). Ein zweiter Klick auf „Zeitkontrolle übernehmen" wäre ein Klick ohne
 * Erkenntnis — derselbe Gedanke, aus dem ein direkt in der Überwachung
 * erfasster Trupp `ueberwachungSeit` schon beim Anlegen bekommt.
 */
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
  const auftrag = input.auftrag?.trim();
  if (auftrag) patch.auftrag = auftrag;
  const einsatzziel = input.einsatzziel?.trim();
  if (einsatzziel) patch.einsatzziel = einsatzziel;
  const person = input.ueberwachtVon?.trim();
  if (person) patch.ueberwachtVon = person;
  if (input.uid) {
    patch.ueberwachungUids = mitUeberwachungsUid(
      input.trupp?.ueberwachungUids,
      input.uid,
    );
  }
  // Nur, wenn sie noch nicht läuft: Ein überschriebener Anfang machte den
  // protokollierten Wechsel der Verantwortung unlesbar.
  if (!input.trupp?.ueberwachungSeit) {
    patch.ueberwachungSeit = input.abmarschZeit;
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
 *
 * Bei der Ausrüstung geht die Grenze **nicht** zwischen den Zeilen, sondern
 * zwischen den Gerätetypen: Maske, Pressluftatmer und Zubehör bleiben beim
 * Träger — der Trupp legt sie zwischen zwei Einsätzen nicht ab, und sie noch
 * einmal zu scannen ist reine Tipparbeit. Die **Flaschen** bleiben zurück: Sie
 * sind leer und werden getauscht, und eine mitgeschleppte Flaschennummer wäre
 * eine Falschaussage darüber, welche Flasche im zweiten Einsatz war — genau
 * die, aus der später das Füllprotokoll wird.
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
  const behalten = (vorherige.truppGeraete ?? [])
    .filter((g) => g.typ !== 'flasche')
    // Kopien, damit die neue Zeile keine Objekte der alten teilt.
    .map((g) => ({ ...g }));
  // Nur, wenn etwas übrig bleibt: Firestore lehnt `undefined` ab, und ein
  // leeres Array wäre eine Aussage über Ausrüstung, die es nicht gibt.
  if (behalten.length > 0) neu.truppGeraete = behalten;
  return neu;
}

export interface ErneuterEinsatzArgs {
  /** Die zurückgekehrte Zeile, aus der der Trupp übernommen wird. */
  vorherige: AtemschutzTrupp;
  jetzt: string;
  /** Das Ergebnis von `entsendePatch` — Zeit und Druck des neuen Abmarschs. */
  entsendung: TruppPatch;
  /** Wer die Zeile anlegt; bekommt damit die Warnungen dieser Bereitstellung. */
  uid?: string;
}

/**
 * Schickt einen zurückgekehrten Trupp erneut in den Einsatz — als *neue* Zeile
 * und in einem Schritt.
 *
 * Am Sammelplatz führt der Weg über „Wieder bereitstellen": Dort wird der
 * Trupp regeneriert, ausgerüstet und *später* von jemand anderem entsendet. Bei
 * der Zeitkontrolle steht der Gruppenkommandant selbst davor und schickt
 * denselben Trupp wieder hinein — der Zwischenzustand „bereit" wäre ein Klick
 * ohne Erkenntnis und, schlimmer, ein Trupp unter Atemschutz, dessen Zeile
 * behauptet, er stehe bereit.
 *
 * Übernommen wird, was am Trupp und nicht an der einzelnen Entsendung hängt:
 * Gerätesatz, Einheit und wer die Zeitkontrolle führt. **Nicht** übernommen
 * werden Messwerte, Warnungen und das Einsatzziel — das ist der Auftrag dieser
 * Entsendung, und der zweite Einsatz führt den Trupp oft woandershin.
 *
 * `ueberwachungSeit` steht auf `jetzt`: Die Verantwortung läuft weiter, aber
 * auf dieser Zeile beginnt sie hier.
 */
/**
 * Was von der vorigen Zeile an einer neuen hängen bleibt: Gerätesatz, Einheit
 * und wer die Zeitkontrolle führt.
 *
 * Einzeln und mit Prüfung, nicht als Spread der alten Zeile: Firestore lehnt
 * `undefined` ab, und ein `paTyp: undefined` aus einem Trupp ohne Gerätesatz
 * ließe den ganzen Schreibvorgang scheitern.
 */
function uebernimmTruppMerkmale(
  neu: NeueBereitstellung,
  vorherige: AtemschutzTrupp,
): NeueBereitstellung {
  if (!neu.entsendetAn && vorherige.entsendetAn) {
    neu.entsendetAn = vorherige.entsendetAn;
  }
  if (vorherige.ueberwachtVon) neu.ueberwachtVon = vorherige.ueberwachtVon;
  if (vorherige.paTyp) neu.paTyp = vorherige.paTyp;
  if (typeof vorherige.flaschenAnzahl === 'number') {
    neu.flaschenAnzahl = vorherige.flaschenAnzahl;
  }
  if (typeof vorherige.flaschenVolumen === 'number') {
    neu.flaschenVolumen = vorherige.flaschenVolumen;
  }
  if (typeof vorherige.fuellDruck === 'number') {
    neu.fuellDruck = vorherige.fuellDruck;
  }
  return neu;
}

export function erneuterEinsatz({
  vorherige,
  jetzt,
  entsendung,
  uid,
}: ErneuterEinsatzArgs): NeueBereitstellung {
  return uebernimmTruppMerkmale(
    {
      ...nextBereitstellung(vorherige, jetzt),
      ...entsendung,
      ueberwachungSeit: jetzt,
      ueberwachungUids: mitUeberwachungsUid(
        vorherige.ueberwachungUids,
        uid ?? '',
      ),
    },
    vorherige,
  );
}

export interface NaechsteZuteilungArgs {
  /** Die zurückgekehrte Zeile, aus der der Trupp übernommen wird. */
  vorherige: AtemschutzTrupp;
  jetzt: string;
  uid?: string;
}

/**
 * Stellt einen zurückgekehrten Trupp bei **derselben** Einheit wieder bereit —
 * als neue Zeile, aber ohne Abmarsch.
 *
 * Für den Einsatz ohne Sammelplatz: Dort führt der Weg über „wieder
 * bereitstellen" am ASSP, hier behält die taktische Einheit den Trupp und
 * schickt ihn später erneut. `ueberwachungBis` wird deshalb nicht gesetzt.
 *
 * Der Unterschied zu `erneuterEinsatz` ist genau der fehlende Abmarsch: Dort
 * geht der Trupp in einem Schritt wieder hinein, hier steht er erst wieder
 * bereit.
 */
export function naechsteZuteilung({
  vorherige,
  jetzt,
  uid,
}: NaechsteZuteilungArgs): NeueBereitstellung {
  return uebernimmTruppMerkmale(
    {
      ...nextBereitstellung(vorherige, jetzt),
      status: 'zugeteilt',
      uebergabeZeit: jetzt,
      ueberwachungSeit: jetzt,
      ueberwachungUids: mitUeberwachungsUid(
        vorherige.ueberwachungUids,
        uid ?? '',
      ),
    },
    vorherige,
  );
}

export interface TruppGruppen {
  bereit: AtemschutzTrupp[];
  /**
   * Einer taktischen Einheit zugeteilt, aber noch nicht unter Atemschutz.
   *
   * Eine eigene Liste und kein vierter Abschnitt in beiden Oberflächen: Der
   * **Sammelplatz** zeigt sie zusammen mit `imEinsatz` — er weiß nicht, wann
   * der Trupp wirklich anschließt. Die **Überwachung** zeigt sie zusammen mit
   * `bereit`: Dort ist ein zugeteilter Trupp genau das, ein Trupp, der auf
   * seinen Einsatzauftrag wartet.
   */
  zugeteilt: AtemschutzTrupp[];
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
  /**
   * Das Protokoll **ohne** die Zeilen, die in den drei Abschnitten oben schon
   * stehen: die älteren Bereitstellungen und die abgemeldeten Trupps.
   *
   * Der Unterschied zu `protokoll` ist eine Aussage über die Oberfläche: Ein
   * Trupp unter Atemschutz stand bisher zweimal auf derselben Seite — oben in
   * seinem Abschnitt und darunter noch einmal im Protokoll. Die zweite Karte
   * trug nichts bei und ließ die Liste doppelt so lang aussehen, wie der
   * Einsatz ist.
   */
  frueher: AtemschutzTrupp[];
}

/**
 * Wie ein Trupp genannt wird: Feuerwehr zuerst, dann sein Name.
 *
 * Am Sammelplatz stehen Trupps mehrerer Wehren, und „Trupp 1" gibt es dann
 * mehrfach. Die Wehr steht deshalb vorn und nicht klein darunter.
 */
export function truppLabel(
  trupp: Pick<AtemschutzTrupp, 'feuerwehr' | 'truppName'>,
): string {
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

  const bereit = aktuell.filter((t) => t.status === 'bereit');
  const zugeteilt = aktuell.filter((t) => t.status === 'zugeteilt');
  const imEinsatz = aktuell.filter((t) => t.status === 'imEinsatz');
  const zurueck = aktuell.filter((t) => t.status === 'zurueck');
  // Über die Zeilen selbst und nicht über den Status: „steht oben" ist genau
  // die Vereinigung der Abschnitte — ein abgemeldeter Trupp ist zwar
  // `aktuell`, hat oben aber keine Karte und gehört ins Protokoll.
  const oben = new Set<AtemschutzTrupp>([
    ...bereit,
    ...zugeteilt,
    ...imEinsatz,
    ...zurueck,
  ]);

  return {
    bereit,
    zugeteilt,
    imEinsatz,
    zurueck,
    aktuell,
    protokoll,
    frueher: protokoll.filter((t) => !oben.has(t)),
  };
}

/** Die Eingabe des Trupp-Dialogs. */
export interface TruppInput {
  truppName?: string;
  feuerwehr: string;
  mitglieder: string[];
  bemerkung?: string;
  /**
   * Die taktische Einheit, der der Trupp zugeordnet ist.
   *
   * Nur bei der Zeitkontrolle erfragt: Am Sammelplatz steht beim Erfassen noch
   * nicht fest, wohin der Trupp geht — das entscheidet sich beim Entsenden. Wer
   * ihn dagegen bei seiner eigenen Einheit erfasst, weiß es in derselben
   * Sekunde.
   */
  entsendetAn?: string;
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

/**
 * Nimmt eine `uid` in die Warnliste auf, ohne zu doppeln.
 *
 * Eine leere `uid` wird übergangen: In einem abgemeldeten Zustand ist sie `''`,
 * und ein leerer Eintrag in der Liste wäre ein Empfänger, den es nicht gibt.
 */
export function mitUeberwachungsUid(
  vorhanden: string[] | undefined,
  uid: string,
): string[] {
  // Bereinigt und nicht bloß kopiert: Was hier zurückgeht, wird geschrieben,
  // und die Liste soll schon beim Schreiben die Schranken einhalten, die der
  // Zeitplan beim Lesen ohnehin durchsetzt (`sanitizeUeberwachungUids`).
  const liste = sanitizeUeberwachungUids(vorhanden);
  const wert = uid?.trim();
  if (
    !istGueltigeUid(wert ?? '') ||
    liste.includes(wert as string) ||
    liste.length >= MAX_UEBERWACHUNG_UIDS
  ) {
    return liste;
  }
  liste.push(wert as string);
  return liste;
}

/** Was am Trupp geändert wird, ohne den Zustand anzufassen. */
export type UeberwachungPatch = Partial<AtemschutzTrupp>;

export interface UebernahmeInput {
  /** Der bestehende Zustand — entscheidet, ob die Übernahme neu ist. */
  trupp: Pick<AtemschutzTrupp, 'ueberwachungSeit' | 'ueberwachungUids'>;
  jetzt: string;
  uid: string;
  ueberwachtVon?: string;
  einsatzziel?: string;
  /** Das WAS des Befehls — nachgetragen oder geändert. */
  auftrag?: string;
  /**
   * Die taktische Einheit, der der Trupp zugeordnet ist — dasselbe Feld, das
   * der Sammelplatz beim Entsenden füllt.
   *
   * Auch hier zu setzen, weil ein Trupp nicht über einen Sammelplatz laufen
   * muss: Arbeitet eine Einheit allein, gibt es niemanden, der die Zuordnung
   * vorher eingetragen hätte — und ohne sie steht am Ende nirgends, wer den
   * Trupp bekommen hat.
   */
  entsendetAn?: string;
  paTyp?: PaTypKey;
  /** Nur bei `paTyp === 'custom'` von Belang, aber immer mitgeschrieben. */
  satz?: Geraetesatz;
}

/**
 * Der Patch, mit dem ein Gruppenkommandant die Zeitkontrolle übernimmt.
 *
 * `ueberwachungSeit` wird **nur beim ersten Mal** gesetzt: Der Zeitpunkt belegt
 * den Wechsel der Verantwortung vom Sammelplatz zum Gruppenkommandanten
 * (FH-06 5.3.4). Würde er bei jeder Änderung neu gestempelt, verschöbe sich der
 * Beleg mit jeder nachträglich getippten Bemerkung nach vorn.
 *
 * Leere Felder fehlen im Patch, statt als `undefined` darin zu stehen —
 * Firestore lehnt `undefined` ab, dieselbe Vorsicht wie in `entsendePatch`.
 */
export function uebernahmePatch(input: UebernahmeInput): UeberwachungPatch {
  const patch: UeberwachungPatch = {
    ueberwachungUids: mitUeberwachungsUid(
      input.trupp.ueberwachungUids,
      input.uid,
    ),
  };
  if (!input.trupp.ueberwachungSeit) patch.ueberwachungSeit = input.jetzt;

  const person = input.ueberwachtVon?.trim();
  if (person) patch.ueberwachtVon = person;
  const ziel = input.einsatzziel?.trim();
  if (ziel) patch.einsatzziel = ziel;
  const auftrag = input.auftrag?.trim();
  if (auftrag) patch.auftrag = auftrag;
  // Leer heißt „nicht angefasst" und nicht „löschen": Eine am Sammelplatz
  // eingetragene Einheit soll eine Übernahme ohne Angabe nicht wegwerfen.
  const einheit = input.entsendetAn?.trim();
  if (einheit) patch.entsendetAn = einheit;

  if (input.paTyp) {
    patch.paTyp = input.paTyp;
    if (input.satz) {
      patch.flaschenAnzahl = input.satz.flaschenAnzahl;
      patch.flaschenVolumen = input.satz.flaschenVolumen;
      patch.fuellDruck = input.satz.fuellDruck;
    }
  }
  return patch;
}

/**
 * Der Patch, mit dem ein zurückgekehrter Trupp an den Sammelplatz zurückgeht.
 *
 * Nur ein Zeitstempel und keine Zustandsänderung: `zurueck` bleibt `zurueck`.
 * Der Trupp ist ja nicht weg, er wird regeneriert — und wer das tut, steht am
 * Sammelplatz und nicht bei der Zeitkontrolle. Die neue Bereitstellung entsteht
 * dort über „wieder bereitstellen" (`nextBereitstellung`).
 *
 * Warum überhaupt festgehalten: Die Übergabe der Verantwortung ist
 * protokollpflichtig — in beide Richtungen. Ohne Vermerk stünde am Ende des
 * Einsatzes an jedem Trupp ein Gruppenkommandant, der ihn „überwacht", auch
 * Stunden nachdem er wieder Umgebungsluft atmet.
 */
export function sammelplatzUebergabePatch(input: {
  jetzt: string;
}): UeberwachungPatch {
  return { ueberwachungBis: input.jetzt };
}

/** Die Eingabe des Druckabfrage-Dialogs. */
export interface DruckabfrageInput {
  druck?: number;
  amZiel?: boolean;
  rueckzug?: boolean;
  bemerkung?: string;
  /** Ohne Angabe gilt der Jetzt-Zeitpunkt des Aufrufers. */
  zeitpunkt?: string;
  /**
   * Ob diese Meldung ins Einsatztagebuch soll.
   *
   * Gilt nur für die freie Statusmeldung: Ankunft und Rückzug gehen immer
   * hinein, unabhängig vom Haken — sie sind Einsatzereignisse, und ein
   * vergessener Haken machte das Tagebuch lückenhaft.
   */
  tagebuch?: boolean;
}

/** Höchster plausibler Flaschendruck — ein Riegel gegen einen Tippfehler. */
export const MAX_DRUCK_BAR = 400;

/**
 * Harte Validierung einer Druckabfrage — wenig, wie überall im Atemschutz:
 * Wer am Funk mitschreibt, darf nicht an einem Formular hängen.
 *
 * Kein `druckMissing` mehr: Der Dialog nimmt auch eine Statusmeldung auf.
 * Abgewiesen wird nur die Meldung, die gar nichts sagt.
 */
export function validateDruckabfrage(input: DruckabfrageInput): string[] {
  if (input.druck != null) {
    if (!Number.isFinite(input.druck)) return ['druckInvalid'];
    if (input.druck < 0 || input.druck > MAX_DRUCK_BAR) return ['druckInvalid'];
    return [];
  }
  if (input.amZiel || input.rueckzug || input.bemerkung?.trim()) return [];
  return ['leereMeldung'];
}

export function buildDruckabfrage(
  input: DruckabfrageInput,
  ctx: { uid: string; jetzt: string },
): Druckabfrage {
  const abfrage: Druckabfrage = {
    zeitpunkt: input.zeitpunkt?.trim() || ctx.jetzt,
  };
  if (typeof input.druck === 'number' && Number.isFinite(input.druck)) {
    abfrage.druck = input.druck;
  }
  if (input.amZiel) abfrage.amZiel = true;
  if (input.rueckzug) abfrage.rueckzug = true;
  const bemerkung = input.bemerkung?.trim();
  if (bemerkung) abfrage.bemerkung = bemerkung;
  const uid = ctx.uid?.trim();
  if (uid) abfrage.erfasstVon = uid;
  return abfrage;
}

/**
 * Ein Gerät aus den Stammdaten als Gerät am Trupp.
 *
 * Bezeichnung und Kennung werden **kopiert**: Die Liste am Trupp soll ohne Join
 * lesbar bleiben, und ein Jahr später soll noch dastehen, welche Flasche
 * gemeint war — auch wenn der Stammdatensatz zwischenzeitlich umbenannt oder
 * ausgeschieden wurde. Dieselbe Abwägung wie bei `geraetName` an der Ausgabe.
 */
export function truppGeraetVonGeraet(g: AtemschutzGeraet): TruppGeraet {
  const tg: TruppGeraet = { typ: g.typ, bezeichnung: g.bezeichnung };
  if (g.id) tg.geraetId = g.id;
  const kennung = geraetKennung(g);
  if (kennung) tg.kennung = kennung;
  return tg;
}

/** Einzeiliges Etikett eines Geräts am Trupp. */
export function truppGeraetLabel(tg: TruppGeraet): string {
  return tg.kennung ? `${tg.kennung} · ${tg.bezeichnung}` : tg.bezeichnung;
}

/** Die Ausrüstung eines Trupps, nach Träger gebündelt. */
export interface TruppGeraeteGruppe {
  /** Der Träger; fehlt bei der noch nicht zugeordneten Ausrüstung. */
  person?: string;
  geraete: TruppGeraet[];
}

/**
 * Die Ausrüstung eines Trupps nach Person gruppiert und sortiert.
 *
 * In Erfassungsreihenfolge ist die Liste am Einsatzort nicht zu lesen: Erfasst
 * wird Scan für Scan, gefragt ist aber „was trägt Huber?" und nicht „was wurde
 * als Drittes gescannt". Gruppiert steht die Antwort in einer Zeile je Person.
 *
 * Drei Festlegungen, die man an der Reihenfolge sonst nicht sieht:
 * - Gruppiert wird ohne Rücksicht auf Groß- und Kleinschreibung, angezeigt
 *   wird die erste Schreibweise. Ältere Zuordnungen kommen aus einem
 *   Freitextfeld, und „huber" und „Huber" sind derselbe Mann.
 * - Innerhalb der Gruppe zählt der **Gerätetyp** vor der Bezeichnung, in der
 *   Reihenfolge von `ATEMSCHUTZ_GERAET_TYPEN`: Der Pressluftatmer und die
 *   Flasche sind die Ausrüstung, um die es geht, Zubehör steht darunter.
 * - Die noch **nicht zugeordnete** Ausrüstung steht am Ende. Sie ist eine
 *   offene Aufgabe und kein Träger; oben zwischen den Namen läse sie sich wie
 *   eine Person.
 */
export function gruppiereTruppGeraete(
  geraete?: TruppGeraet[],
): TruppGeraeteGruppe[] {
  const gruppen = new Map<string, TruppGeraeteGruppe>();
  for (const g of geraete ?? []) {
    const person = g.person?.trim();
    const key = person ? person.toLowerCase() : '';
    const gruppe = gruppen.get(key);
    if (gruppe) {
      gruppe.geraete.push(g);
      continue;
    }
    gruppen.set(key, { ...(person ? { person } : {}), geraete: [g] });
  }

  const typRang = (typ: AtemschutzGeraetTyp) => {
    const rang = ATEMSCHUTZ_GERAET_TYPEN.indexOf(typ);
    return rang < 0 ? ATEMSCHUTZ_GERAET_TYPEN.length : rang;
  };

  for (const gruppe of gruppen.values()) {
    gruppe.geraete.sort(
      (a, b) =>
        typRang(a.typ) - typRang(b.typ) ||
        truppGeraetLabel(a).localeCompare(truppGeraetLabel(b), 'de'),
    );
  }

  return [...gruppen.values()].sort((a, b) => {
    if (!a.person) return b.person ? 1 : 0;
    if (!b.person) return -1;
    return a.person.localeCompare(b.person, 'de');
  });
}

/**
 * Der Feldpfad, mit dem eine verschickte Warnung vermerkt wird.
 *
 * Punktschreibweise auf das verschachtelte Feld, damit die anderen Warnungen
 * unberührt bleiben: Ein `{ warnungen: { rueckzug } }` ersetzte die ganze Map
 * und ließe die Erinnerungen erneut auflaufen.
 *
 * Hier und nicht im Client-Store: Vermerkt wird serverseitig, vom Zeitplan.
 */
export function warnungVermerk(
  key: WarnungKey,
  zeitpunkt: string,
): Record<string, string> {
  return { [`warnungen.${key}`]: zeitpunkt };
}

/**
 * Der Vermerk, dass ein Ereignis im Einsatztagebuch steht — als **Punktpfad**.
 *
 * Wie `warnungVermerk`: Ein ganzes `tagebuch`-Objekt zu schreiben löschte den
 * Schlüssel, den ein zweites Gerät eine Sekunde vorher gesetzt hat.
 */
export function tagebuchVermerk(
  ereignis: TagebuchEreignis,
  zeitpunkt: string,
): Record<string, string> {
  return { [`tagebuch.${ereignis}`]: zeitpunkt };
}

/**
 * Bereinigt die Geräteliste eines Trupps vor dem Schreiben.
 *
 * Nötig, weil Firestore `undefined` ablehnt — und zwar auch **innerhalb** der
 * Objekte eines Arrays. Wer im Dialog einen Trägernamen wieder leert, hätte
 * sonst `person: undefined` im Element stehen, und der ganze Schreibvorgang
 * scheitert mit „Unsupported field value: undefined". Dieselbe Vorsicht wie in
 * `entsendePatch`, nur eine Ebene tiefer.
 *
 * Geräte ohne Bezeichnung *und* ohne Kennung fallen heraus: Sie wären eine
 * Zeile, die nichts benennt.
 */
export function sanitizeTruppGeraete(liste: TruppGeraet[]): TruppGeraet[] {
  const result: TruppGeraet[] = [];
  for (const roh of liste ?? []) {
    const bezeichnung = roh?.bezeichnung?.trim() ?? '';
    const kennung = roh?.kennung?.trim();
    if (!bezeichnung && !kennung) continue;
    const sauber: TruppGeraet = {
      typ: roh.typ,
      bezeichnung: bezeichnung || (kennung as string),
    };
    if (roh.geraetId?.trim()) sauber.geraetId = roh.geraetId.trim();
    if (kennung) sauber.kennung = kennung;
    const person = roh.person?.trim();
    if (person) sauber.person = person;
    result.push(sauber);
  }
  return result;
}

/**
 * Höchstzahl der Geräte, die eine Warnung der Überwachung bekommen.
 *
 * Eine Schranke gegen eine Liste, die niemand mehr liest — und gegen eine, die
 * jemand aufbläht: `ueberwachungUids` steht am Trupp-Dokument, und das darf
 * jeder schreiben, der am Einsatz schreiben darf (`call/{id}/{subitem=**}` in
 * den Firestore-Regeln), einschließlich eines Einsatz-Gastes mit Schreibrecht.
 * Zwanzig ist weit über dem, was ein Trupp je braucht — der Regelfall sind ein
 * bis zwei Geräte.
 */
export const MAX_UEBERWACHUNG_UIDS = 20;

/**
 * Ob eine Zeichenkette als Firestore-Dokument-ID taugen kann.
 *
 * **Sicherheitsrelevant, nicht Kosmetik.** Die `uid`s aus `ueberwachungUids`
 * werden serverseitig zu `user/{uid}` zusammengesetzt. Ein Wert mit
 * Schrägstrich ergäbe einen *anderen* Pfad — `foo/geheim/bar` liest ein Dokument
 * in einer Untersammlung von `user/foo` —, und `.` oder `..` lässt das SDK
 * werfen. Ein Wurf wäre hier besonders teuer: Er käme aus dem Lesen der Token
 * und damit von *außerhalb* der Fehlerbehandlung je Trupp, ein einziger
 * krummer Eintrag hielte also die Warnungen aller anderen Trupps auf.
 *
 * Geprüft wird gegen die Regeln für Dokument-IDs und nicht gegen das Format von
 * Firebase-Auth-`uid`s: Letzteres ist nirgends garantiert, die Pfadregeln sind
 * das, worauf es hier ankommt.
 */
export function istGueltigeUid(uid: string): boolean {
  const wert = (uid ?? '').trim();
  if (!wert) return false;
  if (wert.includes('/')) return false;
  if (wert === '.' || wert === '..') return false;
  // Von Firestore reservierte Form.
  if (/^__.*__$/.test(wert)) return false;
  // Firestore lässt höchstens 1500 Byte zu; UTF-8-Länge, nicht Zeichenzahl.
  return new TextEncoder().encode(wert).length <= 1500;
}

/**
 * Die brauchbaren Empfänger einer Warnung: gültig, ohne Dubletten, gekürzt.
 *
 * Angewendet beim **Lesen** und nicht nur beim Schreiben: Geschrieben hat die
 * Liste möglicherweise ein anderer Client, und der Zeitplan darf sich nicht
 * darauf verlassen, dass es dieser war.
 */
export function sanitizeUeberwachungUids(
  uids: string[] | undefined,
  max = MAX_UEBERWACHUNG_UIDS,
): string[] {
  const result: string[] = [];
  const gesehen = new Set<string>();
  for (const roh of uids ?? []) {
    if (typeof roh !== 'string') continue;
    const uid = roh.trim();
    if (!istGueltigeUid(uid) || gesehen.has(uid)) continue;
    gesehen.add(uid);
    result.push(uid);
    if (result.length >= max) break;
  }
  return result;
}
