/**
 * Atemschutzüberwachung — die Rechnung hinter der Einsatzzeitkontrolle.
 *
 * Alles hier ist rein und ohne Firestore, wie `common/atemschutz.ts`: Die
 * Zahlen sind der sicherheitsrelevante Teil des Features, und sie sollen ohne
 * Oberfläche und ohne Netz prüfbar sein.
 *
 * Grundlage ist das ÖBFV-Fachhandbuch 06 „Atemschutz", Abschnitt 5.3.2
 * (Rückzugszeitpunkt, rechnerische Einsatzdauer) und 5.3.3
 * (Atemschutzüberwachung, Drittel-Regel). Die Referenzbeispiele der Unterlage
 * stehen als Tests in `atemschutzUeberwachung.test.ts` — wer eine Formel hier
 * anfasst, muss sie weiterhin treffen.
 */

import {
  PA_SAETZE,
  WARNUNG_KEYS,
  type AtemschutzGeraet,
  type AtemschutzTrupp,
  type Druckabfrage,
  type Geraetesatz,
  type WarnungKey,
} from './atemschutz';

/**
 * Reservedruck, der nicht in die Einsatzzeit eingerechnet werden darf, und
 * gleichzeitig die Schwelle der Restdruckwarneinrichtung.
 *
 * Ein Wert für beides, weil es derselbe ist: Die Unterlage nennt den
 * Reservedruck des Gerätes mit 50–60 bar und rechnet ihre Beispiele mit 55 bar;
 * die Warneinrichtung spricht bei 55 ± 5 bar an. Zwei Konstanten mit derselben
 * Zahl wären zwei Stellen, an denen jemand die eine ändert und die andere
 * vergisst.
 */
export const RESERVEDRUCK_BAR = 55;

/**
 * Ab hier ändert Luft ihr Kompressionsverhalten, und der Luftvorrat lässt sich
 * nicht mehr nach der Zustandsgleichung für ideale Gase rechnen (FH-06, S. 48).
 */
export const KORREKTUR_AB_BAR = 265;

/** „daraus ergibt sich ein Korrekturfaktor von 0,9" (FH-06, S. 48). */
export const KORREKTURFAKTOR = 0.9;

/** „Bei mittlerer Anstrengung … etwa 50 Liter/Minute" (FH-06, S. 47). */
export const VERBRAUCH_MITTEL_L_MIN = 50;

/**
 * „Bei schwerer Arbeit (Luftverbrauch ca. 80 – 100 L/min)" — die Mitte davon.
 * Nur ein Vergleichswert für die Anzeige; gerechnet wird mit dem gemessenen
 * Verbrauch, sobald es einen gibt.
 */
export const VERBRAUCH_SCHWER_L_MIN = 90;

/**
 * Vorlauf der Rückzugswarnung.
 *
 * Drei Minuten, damit die Warnung zum Absetzen einer Funkmeldung reicht und
 * nicht erst kommt, wenn der Trupp schon hätte umkehren müssen. Länger nicht:
 * Bei einer erwarteten Einsatzzeit von rund 25 Minuten wäre eine
 * Fünf-Minuten-Warnung ein Fünftel der Zeit und würde als Fehlalarm gelesen.
 */
export const RUECKZUG_VORLAUF_MIN = 3;

/**
 * Der Korrekturfaktor eines Gerätesatzes.
 *
 * Er hängt am **Nenndruck** der Flasche und nicht am gerade anliegenden Druck.
 * Das ist die Lesart der Unterlage („Dieser ist nur bei 300 bar Flaschen
 * erforderlich") und die einzige, die keinen Sprung erzeugt: Am aktuellen Druck
 * bemessen, gewönne eine 300-bar-Flasche beim Unterschreiten von 265 bar
 * plötzlich 10 % Luftvorrat dazu. Für eine teilgefüllte 300er rechnet es den
 * Vorrat leicht zu klein — die sichere Richtung.
 */
export function korrekturfaktor(nenndruck: number): number {
  return nenndruck > KORREKTUR_AB_BAR ? KORREKTURFAKTOR : 1;
}

/** Gesamtes Flaschenvolumen eines Geräteträgers in Liter. */
export function gesamtVolumenLiter(satz: Geraetesatz): number {
  return satz.flaschenAnzahl * satz.flaschenVolumen;
}

/**
 * Der Reserveluftvorrat in Liter — die Luft unter dem Reservedruck.
 *
 * **Ohne** Korrekturfaktor, weil die Unterlage ihn auch so ausweist: 440 l bei
 * 2×4 l, 330 l bei 1×6 l. Nur der Fülldruck wird korrigiert.
 */
export function reserveLuftLiter(
  satz: Geraetesatz,
  reservedruck = RESERVEDRUCK_BAR,
): number {
  return gesamtVolumenLiter(satz) * reservedruck;
}

export interface DauerOptionen {
  /** Luftverbrauch in l/min. Ohne Angabe der Anhaltswert für mittlere Arbeit. */
  verbrauch?: number;
  reservedruck?: number;
  /** Der wirklich abgelesene Startdruck. Ohne Angabe der Nenndruck. */
  startdruck?: number;
}

/**
 * Die nutzbare Luft in Liter: `V × (Fülldruck × K − Reservedruck)`.
 *
 * Nie negativ — eine Flasche unter dem Reservedruck hat keinen nutzbaren
 * Vorrat, und eine negative Zahl würde weiter unten zu einer negativen
 * Einsatzdauer.
 */
export function nutzbareLuftLiter(
  satz: Geraetesatz,
  opts: DauerOptionen = {},
): number {
  const startdruck = opts.startdruck ?? satz.fuellDruck;
  const reservedruck = opts.reservedruck ?? RESERVEDRUCK_BAR;
  const liter =
    gesamtVolumenLiter(satz) *
    (startdruck * korrekturfaktor(satz.fuellDruck) - reservedruck);
  return Math.max(0, liter);
}

/**
 * Die rechnerische Einsatzdauer in Minuten (FH-06, S. 48).
 *
 * Ausdrücklich ein **Anhaltswert**: „Bei schwerer Arbeit kann sich allerdings
 * die Einsatzdauer wesentlich verkürzen." Genau deshalb wird sie hier nur für
 * die Drittelmarken der Meldedisziplin verwendet und nicht für den Rückzug —
 * der rechnet mit dem gemessenen Verbrauch, sobald zwei Druckwerte vorliegen.
 */
export function rechnerischeEinsatzdauerMin(
  satz: Geraetesatz,
  opts: DauerOptionen = {},
): number {
  const verbrauch = opts.verbrauch ?? VERBRAUCH_MITTEL_L_MIN;
  if (!(verbrauch > 0)) return 0;
  return nutzbareLuftLiter(satz, opts) / verbrauch;
}

/** Der Anteil des Trupp-Dokuments, aus dem sich der Gerätesatz ergibt. */
export type GeraetesatzQuelle = Pick<
  AtemschutzTrupp,
  'paTyp' | 'flaschenAnzahl' | 'flaschenVolumen' | 'fuellDruck'
>;

/**
 * Der Gerätesatz eines Trupps.
 *
 * Eine gewählte Vorlage gewinnt vollständig — sie *ist* die Definition des
 * Satzes. Bei `custom` und ohne Angabe zählen die Werte am Trupp, und was dort
 * fehlt, kommt aus `vorgabe`. So bleibt die Rechnung auch dann möglich, wenn
 * am Sammelplatz niemand ein Volumen eingetippt hat.
 */
export function geraetesatzVon(
  trupp: GeraetesatzQuelle,
  vorgabe: Geraetesatz = PA_SAETZE.standard300,
): Geraetesatz {
  if (trupp.paTyp && trupp.paTyp !== 'custom') {
    return PA_SAETZE[trupp.paTyp];
  }
  return {
    flaschenAnzahl:
      trupp.flaschenAnzahl && trupp.flaschenAnzahl > 0
        ? trupp.flaschenAnzahl
        : vorgabe.flaschenAnzahl,
    flaschenVolumen:
      trupp.flaschenVolumen && trupp.flaschenVolumen > 0
        ? trupp.flaschenVolumen
        : vorgabe.flaschenVolumen,
    fuellDruck:
      trupp.fuellDruck && trupp.fuellDruck > 0
        ? trupp.fuellDruck
        : vorgabe.fuellDruck,
  };
}

/**
 * Der Gerätesatz, der in dieser Feuerwehr der Regelfall ist.
 *
 * Abgeleitet aus dem eigenen Flaschenbestand und nicht festgelegt: Welche
 * Flasche eine Wehr fährt, steht in ihren Stammdaten, und eine dort abgelesene
 * Vorbelegung ist genauer als jede Annahme im Code. Ohne erfasste Flaschen —
 * der Zustand jeder Feuerwehr am Tag der Auslieferung — bleibt der
 * Standard-Pressluftatmer mit 300 bar.
 *
 * `flaschenAnzahl` ist immer 1: Aus dem Bestand geht nicht hervor, wie viele
 * Flaschen an einem Gerät hängen.
 */
export function vorgabeGeraetesatz(
  geraete: AtemschutzGeraet[],
  basis: Geraetesatz = PA_SAETZE.standard300,
): Geraetesatz {
  const zaehler = new Map<string, { satz: Geraetesatz; anzahl: number }>();
  for (const g of geraete ?? []) {
    if (g.typ !== 'flasche' || g.active === false) continue;
    if (!g.volumenLiter || g.volumenLiter <= 0) continue;
    const fuellDruck =
      g.nenndruck && g.nenndruck > 0 ? g.nenndruck : basis.fuellDruck;
    const key = `${g.volumenLiter}|${fuellDruck}`;
    const eintrag = zaehler.get(key);
    if (eintrag) {
      eintrag.anzahl += 1;
    } else {
      zaehler.set(key, {
        satz: {
          flaschenAnzahl: 1,
          flaschenVolumen: g.volumenLiter,
          fuellDruck,
        },
        anzahl: 1,
      });
    }
  }
  let beste: { satz: Geraetesatz; anzahl: number } | undefined;
  for (const eintrag of zaehler.values()) {
    if (!beste || eintrag.anzahl > beste.anzahl) beste = eintrag;
  }
  return beste?.satz ?? basis;
}

/** Ein Druckwert mit Zeitstempel — der Abmarsch oder eine Abfrage. */
export interface DruckPunkt {
  zeitpunkt: string;
  druck: number;
}

export interface Verbrauch {
  barProMin: number;
  literProMin: number;
  /** `standard` heißt: der Anhaltswert der Unterlage, noch nichts gemessen. */
  quelle: 'standard' | 'gemessen';
}

function zeit(iso?: string): number {
  const t = new Date(iso ?? '').getTime();
  return Number.isNaN(t) ? Number.NaN : t;
}

function istPunkt(p: DruckPunkt): boolean {
  return Number.isFinite(zeit(p.zeitpunkt)) && Number.isFinite(p.druck);
}

/**
 * Der tatsächliche Luftverbrauch aus dem ersten und dem letzten Druckwert.
 *
 * Über die ganze Strecke und nicht über die letzten zwei Werte: Zwei kurz
 * aufeinanderfolgende Abfragen können eine Verschnaufpause oder eine
 * Treppenflucht treffen, und die Prognose würde bei jeder Abfrage springen.
 * „Jede weitere Druckabfrage schreibt den Wert fort" heißt Mittelwert über den
 * Einsatz, nicht Momentanwert.
 *
 * `undefined` heißt: nicht bestimmbar — ein Wert allein, gleiche Zeitstempel,
 * oder ein gestiegener Druck (jemand hat sich vertippt, oder es ist ein
 * anderer Geräteträger). Der Aufrufer nimmt dann den Standardwert.
 */
export function verbrauchAusPunkten(
  punkte: DruckPunkt[],
  satz: Geraetesatz,
): Verbrauch | undefined {
  const gueltig = (punkte ?? []).filter(istPunkt);
  if (gueltig.length < 2) return undefined;
  const sortiert = [...gueltig].sort((a, b) => zeit(a.zeitpunkt) - zeit(b.zeitpunkt));
  const erster = sortiert[0];
  const letzter = sortiert[sortiert.length - 1];
  const dauerMin = (zeit(letzter.zeitpunkt) - zeit(erster.zeitpunkt)) / 60_000;
  const abfall = erster.druck - letzter.druck;
  if (!(dauerMin > 0) || !(abfall > 0)) return undefined;
  const barProMin = abfall / dauerMin;
  return {
    barProMin,
    literProMin:
      barProMin * gesamtVolumenLiter(satz) * korrekturfaktor(satz.fuellDruck),
    quelle: 'gemessen',
  };
}

/**
 * Der Rückmarschdruck aus dem doppelten Vormarschdruckabfall.
 *
 * „Grundsatz: Rückmarschdruck = doppelter Vormarschdruckabfall" (FH-06, S. 46)
 * — und zwar wörtlich als **absoluter Druck**: Der Trupp muss umkehren, solange
 * noch doppelt so viel Luft in der Flasche ist, wie der Hinweg gekostet hat.
 *
 * Gegenprobe an Beispiel 2 der Unterlage („Rückmarsch bei Ansprechen des
 * Warnsignals, da der doppelte Vormarschdruckabfall nur 40 bar beträgt"): Bei
 * 20 bar Abfall ergibt diese Formel 40 bar, also weniger als die 55 bar der
 * Warneinrichtung — genau die Aussage des Beispiels. Jede andere Lesart, etwa
 * „Fülldruck minus doppelter Abfall", käme dort auf 260 bar und ließe die
 * Restdruckwarnung nie zuerst greifen.
 *
 * `undefined` ohne Zielmeldung: Ohne den Druck bei Erreichen des Einsatzziels
 * ist der Wert nicht berechenbar, und ein geschätzter wäre gefährlicher als
 * keiner.
 */
export function rueckmarschDruck(args: {
  startdruck: number;
  druckAmZiel?: number;
}): number | undefined {
  if (args.druckAmZiel == null || !Number.isFinite(args.druckAmZiel)) {
    return undefined;
  }
  const abfall = args.startdruck - args.druckAmZiel;
  if (!(abfall >= 0)) return undefined;
  return 2 * abfall;
}

export interface UeberwachungStand {
  satz: Geraetesatz;
  /** Druck beim Anschließen des Luftversorgungssystems. */
  startdruck: number;
  /** Ob der Startdruck nur der Nenndruck ist, weil niemand abgelesen hat. */
  startdruckGeschaetzt: boolean;
  verbrauch: Verbrauch;
  /**
   * Die rechnerische Einsatzdauer mit dem Anhaltswert von 50 l/min, fest ab
   * dem Abmarsch.
   *
   * Bewusst **nicht** mit dem gemessenen Verbrauch: Die Drittelmarken sind eine
   * Meldedisziplin und müssen von Anfang an feststehen. Zöge sie ein sparsamer
   * Trupp nach hinten, käme die Nachfrage genau dann später, wenn niemand
   * gemeldet hat.
   */
  erwarteteDauerMin: number;
  /** Minuten seit dem Abmarsch. */
  einsatzMinuten: number;
  /** Der jüngste bekannte Druckwert. */
  letzterPunkt: DruckPunkt;
  /** Der aus dem letzten Wert fortgeschriebene vermutete Druck jetzt. */
  vermuteterDruck: number;
  /** Druck bei Erreichen des Einsatzziels, wenn gemeldet. */
  druckAmZiel?: number;
  /**
   * Wann der Trupp das Einsatzziel erreicht hat, wenn gemeldet (ISO).
   *
   * Neben dem Druck, weil beides aus derselben ersten Zielmeldung kommt und
   * die Oberfläche den Zeitpunkt sonst ein zweites Mal aus den Abfragen suchen
   * müsste — mit dem Risiko, dabei die *letzte* statt der ersten zu nehmen.
   */
  zielSeit?: string;
  /**
   * Wann der Trupp den Rückzug angetreten hat, wenn gemeldet (ISO).
   *
   * Ab hier sind die Fristen erledigt: Sie sollten den Trupp zum Umkehren
   * bringen, und er kehrt um. Die Rechnung läuft weiter — der Trupp atmet noch
   * aus der Flasche —, aber gewarnt wird nicht mehr.
   */
  rueckzugSeit?: string;
  /** Doppelter Vormarschdruckabfall, wenn berechenbar. */
  rueckmarschDruck?: number;
  /** Der maßgebliche Druck: der höhere von Rückmarschdruck und Restdruck. */
  rueckzugsDruck: number;
  rueckzugsGrund: 'vormarsch' | 'restdruck';
  /** Prognostizierte Uhrzeit des Rückzugs (ISO). */
  rueckzugZeit: string;
  /** Negativ heißt: überschritten. */
  minutenBisRueckzug: number;
  /** Wann die Restdruckwarnung anspricht (ISO). */
  restdruckZeit: string;
  minutenBisRestdruck: number;
  drittelZeit: string;
  zweiDrittelZeit: string;
}

export interface StandOptionen {
  /** Der Gerätesatz, der gilt, wenn am Trupp keiner steht. */
  vorgabe?: Geraetesatz;
}

/** Die Druckabfragen eines Trupps, aufsteigend und ohne Unbrauchbares. */
export function sortierteAbfragen(trupp: {
  abfragen?: Druckabfrage[];
}): Druckabfrage[] {
  return [...(trupp.abfragen ?? [])]
    .filter((a) => istPunkt(a))
    .sort((a, b) => zeit(a.zeitpunkt) - zeit(b.zeitpunkt));
}

/** Der Anteil des Trupp-Dokuments, den die Rechnung braucht. */
export type UeberwachungsEingabe = GeraetesatzQuelle &
  Pick<AtemschutzTrupp, 'abmarschZeit' | 'druckAbmarsch' | 'abfragen'>;

/**
 * Der vermutete Atemluftstand eines Trupps, laufend fortgeschrieben.
 *
 * `undefined`, solange kein Abmarsch protokolliert ist: Vor dem Anschließen des
 * Luftversorgungssystems läuft keine Zeit, und eine Restzeit anzuzeigen hieße,
 * eine Überwachung zu behaupten, die es noch nicht gibt.
 */
export function berechneStand(
  trupp: UeberwachungsEingabe,
  jetzt: Date,
  opts: StandOptionen = {},
): UeberwachungStand | undefined {
  const abmarsch = zeit(trupp.abmarschZeit);
  if (!Number.isFinite(abmarsch)) return undefined;

  const satz = geraetesatzVon(trupp, opts.vorgabe);
  const startdruckGeschaetzt =
    trupp.druckAbmarsch == null || !Number.isFinite(trupp.druckAbmarsch);
  const startdruck = startdruckGeschaetzt
    ? satz.fuellDruck
    : (trupp.druckAbmarsch as number);

  const abfragen = sortierteAbfragen(trupp);
  const punkte: DruckPunkt[] = [
    { zeitpunkt: trupp.abmarschZeit as string, druck: startdruck },
    ...abfragen.map((a) => ({ zeitpunkt: a.zeitpunkt, druck: a.druck })),
  ];

  const gemessen = verbrauchAusPunkten(punkte, satz);
  const verbrauch: Verbrauch = gemessen ?? {
    // Aus dem Anhaltswert in bar/min: 50 l/min geteilt durch das korrigierte
    // Volumen. So passt die Druckprognose zu derselben Luftmenge, mit der auch
    // die rechnerische Einsatzdauer gebildet wird.
    barProMin:
      VERBRAUCH_MITTEL_L_MIN /
      (gesamtVolumenLiter(satz) * korrekturfaktor(satz.fuellDruck)),
    literProMin: VERBRAUCH_MITTEL_L_MIN,
    quelle: 'standard',
  };

  const letzterPunkt = punkte[punkte.length - 1];
  const seitLetztemMin = (jetzt.getTime() - zeit(letzterPunkt.zeitpunkt)) / 60_000;
  const vermuteterDruck = Math.max(
    0,
    letzterPunkt.druck - verbrauch.barProMin * Math.max(0, seitLetztemMin),
  );

  // Die *erste* Zielmeldung zählt: „Flaschendruck bei Erreichen des
  // Einsatzzieles". Eine spätere Abfrage mit gesetztem Haken wäre eine
  // Korrektur des Ortes, nicht ein zweites Erreichen.
  const zielAbfrage = abfragen.find((a) => a.amZiel === true);
  // Die *erste* Rückzugsmeldung zählt, aus demselben Grund wie bei der
  // Ankunft: Eine zweite wäre eine Wiederholung, nicht ein zweiter Rückzug.
  const rueckzugAbfrage = abfragen.find((a) => a.rueckzug === true);
  const rueckmarsch = rueckmarschDruck({
    startdruck,
    druckAmZiel: zielAbfrage?.druck,
  });

  const vormarschGreiftZuerst =
    rueckmarsch != null && rueckmarsch > RESERVEDRUCK_BAR;
  const rueckzugsDruck = vormarschGreiftZuerst
    ? (rueckmarsch as number)
    : RESERVEDRUCK_BAR;

  const zeitBisDruck = (druck: number): string => {
    const minuten = (letzterPunkt.druck - druck) / verbrauch.barProMin;
    return new Date(zeit(letzterPunkt.zeitpunkt) + minuten * 60_000).toISOString();
  };

  const restdruckZeit = zeitBisDruck(RESERVEDRUCK_BAR);
  // Identische Zeichenkette und nicht bloß derselbe Zeitpunkt, wenn die
  // Restdruckwarnung maßgeblich ist: Die Oberfläche vergleicht beide, um „der
  // Rückzug hängt am Restdruck" ohne zweite Rechnung erkennen zu können.
  const rueckzugZeit = vormarschGreiftZuerst
    ? zeitBisDruck(rueckzugsDruck)
    : restdruckZeit;

  const erwarteteDauerMin = rechnerischeEinsatzdauerMin(satz, { startdruck });
  const markeNach = (minuten: number) =>
    new Date(abmarsch + minuten * 60_000).toISOString();

  return {
    satz,
    startdruck,
    startdruckGeschaetzt,
    verbrauch,
    erwarteteDauerMin,
    einsatzMinuten: (jetzt.getTime() - abmarsch) / 60_000,
    letzterPunkt,
    vermuteterDruck,
    ...(zielAbfrage
      ? { druckAmZiel: zielAbfrage.druck, zielSeit: zielAbfrage.zeitpunkt }
      : {}),
    ...(rueckzugAbfrage ? { rueckzugSeit: rueckzugAbfrage.zeitpunkt } : {}),
    ...(rueckmarsch != null ? { rueckmarschDruck: rueckmarsch } : {}),
    rueckzugsDruck,
    rueckzugsGrund: vormarschGreiftZuerst ? 'vormarsch' : 'restdruck',
    rueckzugZeit,
    minutenBisRueckzug: (zeit(rueckzugZeit) - jetzt.getTime()) / 60_000,
    restdruckZeit,
    minutenBisRestdruck: (zeit(restdruckZeit) - jetzt.getTime()) / 60_000,
    drittelZeit: markeNach(erwarteteDauerMin / 3),
    zweiDrittelZeit: markeNach((2 * erwarteteDauerMin) / 3),
  };
}

export interface WarnungFaellig {
  key: WarnungKey;
  /** Seit wann sie fällig ist (ISO) — für „überfällig seit". */
  faelligSeit: string;
}

export interface WarnungOptionen extends StandOptionen {
  vorlaufMin?: number;
}

/** Der Anteil des Trupp-Dokuments, aus dem sich Warnungen ergeben. */
export type WarnungsEingabe = UeberwachungsEingabe &
  Pick<AtemschutzTrupp, 'status'>;

/**
 * Welche Warnungen für diesen Trupp fällig sind — unabhängig davon, ob sie
 * schon verschickt wurden.
 *
 * Nur für einen Trupp im Einsatz: Ein zurückgekehrter Trupp atmet Umgebungsluft,
 * und eine Warnung an eine Mannschaft, die schon beim Sammelplatz steht,
 * entwertet jede weitere.
 *
 * Die Drittel-Regel ist wörtlich umgesetzt: „Erfolgt nach einem Drittel der zu
 * erwartenden Einsatzzeit keine Lage- und Flaschendruckmeldung durch den Trupp,
 * hat die mit der Atemschutzüberwachung betraute Person die Flaschendrücke
 * abzufragen." Eine erfasste Druckabfrage *ist* diese Meldung — deshalb
 * schweigt die Überwachung, sobald eine vorliegt, und erinnert nach zwei
 * Dritteln erneut, wenn seit dem ersten Drittel keine mehr kam.
 */
export function faelligeWarnungen(
  trupp: WarnungsEingabe,
  jetzt: Date,
  opts: WarnungOptionen = {},
): WarnungFaellig[] {
  if (trupp.status !== 'imEinsatz') return [];
  const stand = berechneStand(trupp, jetzt, opts);
  if (!stand) return [];
  // Der Trupp ist auf dem Rückweg. Alle drei Warnungen zielen darauf, ihn dazu
  // zu bringen — jetzt noch zu mahnen wäre ein Fehlalarm, und ein Fehlalarm
  // entwertet jede weitere Warnung. Beobachtet wird ab hier der Reservedruck
  // (`dringlichkeit`), gemeldet wird nicht mehr.
  if (stand.rueckzugSeit) return [];

  const faellig: WarnungFaellig[] = [];
  const abfragen = sortierteAbfragen(trupp);
  const letzte = abfragen[abfragen.length - 1];
  const jetztMs = jetzt.getTime();

  if (jetztMs >= zeit(stand.drittelZeit) && !letzte) {
    faellig.push({ key: 'drittel', faelligSeit: stand.drittelZeit });
  }
  if (
    jetztMs >= zeit(stand.zweiDrittelZeit) &&
    (!letzte || zeit(letzte.zeitpunkt) < zeit(stand.drittelZeit))
  ) {
    faellig.push({ key: 'zweiDrittel', faelligSeit: stand.zweiDrittelZeit });
  }

  const vorlauf = opts.vorlaufMin ?? RUECKZUG_VORLAUF_MIN;
  const warnZeit = new Date(
    zeit(stand.rueckzugZeit) - vorlauf * 60_000,
  ).toISOString();
  if (jetztMs >= zeit(warnZeit)) {
    faellig.push({ key: 'rueckzug', faelligSeit: warnZeit });
  }

  return faellig;
}

/** Der Anteil des Trupp-Dokuments, den die Buchführung braucht. */
export type OffeneWarnungsEingabe = WarnungsEingabe &
  Pick<AtemschutzTrupp, 'warnungen'>;

/**
 * Die fälligen Warnungen, die noch nicht verschickt wurden.
 *
 * Die Buchführung steht am Dokument (`warnungen`) und nicht im Server: Der
 * Zeitplan läuft jede Minute, und ohne sie käme jede Warnung sechzigmal je
 * Stunde erneut.
 */
export function offeneWarnungen(
  trupp: OffeneWarnungsEingabe,
  jetzt: Date,
  opts: WarnungOptionen = {},
): WarnungFaellig[] {
  const verschickt = trupp.warnungen ?? {};
  return faelligeWarnungen(trupp, jetzt, opts).filter((w) => !verschickt[w.key]);
}

export interface WarnungPlan {
  key: WarnungKey;
  /** Ab wann sie fällig wird (ISO) — kann in der Vergangenheit liegen. */
  faelligAb: string;
}

/**
 * Die **nächste** Warnung dieses Trupps und wann sie fällig wird.
 *
 * Grundlage der Terminplanung: Statt jede Minute nachzusehen, wird zu genau
 * diesem Zeitpunkt eine Aufgabe eingeplant (Cloud Tasks, siehe
 * `docs/atemschutzueberwachung.md`).
 *
 * Gefiltert wird nur nach dem, was **jetzt schon feststeht** — den bereits
 * verschickten Warnungen. Ob eine Drittelmarke wirklich zuschlägt, hängt daran,
 * ob bis dahin eine Meldung kommt, und das lässt sich nicht vorhersagen. Diese
 * Frage entscheidet erst der Lauf zum Termin (`offeneWarnungen`); kommt er zu
 * früh, schickt er nichts und plant die nächste.
 *
 * Ein Termin in der Vergangenheit ist kein Fehler, sondern die Aussage „das ist
 * schon fällig" — etwa bei einem nachgetragenen Abmarsch. Der Aufrufer plant
 * dann auf jetzt.
 */
export function naechsteWarnung(
  trupp: OffeneWarnungsEingabe,
  jetzt: Date,
  opts: WarnungOptionen = {},
): WarnungPlan | undefined {
  if (trupp.status !== 'imEinsatz') return undefined;
  const stand = berechneStand(trupp, jetzt, opts);
  if (!stand) return undefined;
  // Kein Termin mehr nach der Rückzugsmeldung — s. `faelligeWarnungen`. Die
  // Aufgabe würde zur berechneten Zeit nichts finden und nur Kosten machen.
  if (stand.rueckzugSeit) return undefined;

  const verschickt = trupp.warnungen ?? {};
  const vorlauf = opts.vorlaufMin ?? RUECKZUG_VORLAUF_MIN;
  const kandidaten: WarnungPlan[] = [
    { key: 'drittel' as const, faelligAb: stand.drittelZeit },
    { key: 'zweiDrittel' as const, faelligAb: stand.zweiDrittelZeit },
    {
      key: 'rueckzug' as const,
      faelligAb: new Date(
        zeit(stand.rueckzugZeit) - vorlauf * 60_000,
      ).toISOString(),
    },
  ].filter((k) => !verschickt[k.key] && Number.isFinite(zeit(k.faelligAb)));

  kandidaten.sort((a, b) => zeit(a.faelligAb) - zeit(b.faelligAb));
  return kandidaten[0];
}

/**
 * Die dringlichste aus einer Liste fälliger Warnungen.
 *
 * Es wird nur eine verschickt: Ein Gerät, das eine Weile aus war, hätte sonst
 * drei Meldungen gleichzeitig auf dem Bildschirm, und die wichtigste ginge
 * zwischen zwei Erinnerungen unter.
 */
export function dringlichsteWarnung(
  warnungen: WarnungFaellig[],
): WarnungFaellig | undefined {
  let beste: WarnungFaellig | undefined;
  for (const w of warnungen ?? []) {
    if (!beste || WARNUNG_KEYS.indexOf(w.key) > WARNUNG_KEYS.indexOf(beste.key)) {
      beste = w;
    }
  }
  return beste;
}

/**
 * Wie dringend die Lage eines Trupps ist — die Grundlage für Farbe und
 * Reihenfolge in der Anzeige.
 *
 * Die Schwellen hängen an der Rückzugsprognose und nicht an einer festen
 * Minutenzahl: Ein Langzeit-PA hat 58 Minuten, ein Standardgerät 24 — dieselben
 * „fünf Minuten Restzeit" bedeuten dort Verschiedenes.
 */
export type Dringlichkeit = 'ok' | 'achtung' | 'kritisch' | 'ueberschritten';

export function dringlichkeit(
  stand: UeberwachungStand,
  vorlaufMin = RUECKZUG_VORLAUF_MIN,
): Dringlichkeit {
  if (stand.rueckzugSeit) {
    // Auf dem Rückweg zählt nicht mehr die Frist — sie ist erfüllt —, sondern
    // die Reserve. Nicht „ok": Der Trupp atmet weiter aus der Flasche, und
    // eine grüne Karte hieße „hier ist nichts zu tun".
    return stand.vermuteterDruck <= RESERVEDRUCK_BAR ? 'kritisch' : 'achtung';
  }
  if (stand.minutenBisRueckzug <= 0) return 'ueberschritten';
  if (stand.minutenBisRueckzug <= vorlaufMin) return 'kritisch';
  if (stand.minutenBisRueckzug <= stand.erwarteteDauerMin / 3) return 'achtung';
  return 'ok';
}

/**
 * Wie viel des nutzbaren Drucks verbraucht ist, in Prozent von 0 bis 100.
 *
 * Bezugsgröße ist die Spanne vom Abmarschdruck bis zum **Rückzugsdruck**, nicht
 * bis null: Der Balken soll voll sein, wenn umgekehrt werden muss, und nicht
 * erst, wenn die Flasche leer ist.
 */
export function fortschrittProzent(stand: UeberwachungStand): number {
  const spanne = stand.startdruck - stand.rueckzugsDruck;
  if (!(spanne > 0)) return 100;
  const verbraucht = stand.startdruck - stand.vermuteterDruck;
  return Math.min(100, Math.max(0, (verbraucht / spanne) * 100));
}
