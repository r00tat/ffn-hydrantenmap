/**
 * Verrechnung der Flaschenfüllungen — Typen und Entscheidungslogik.
 *
 * Rein und ohne Firestore, dieselbe Bauweise wie `common/atemschutz.ts`:
 * Client (Dialog, Übersicht) und Server (Actions, PDF) brauchen dieselben
 * Regeln, und für eine Codesuche soll niemand einen Serverpfad ziehen müssen.
 */

import { normalizeCode, type AtemschutzFuellung } from './atemschutz';

/** Untersammlungen unter `groups/{groupId}`. */
export const ATEMSCHUTZ_EMPFAENGER_COLLECTION_ID = 'atemschutzEmpfaenger';
export const ATEMSCHUTZ_RECHNUNG_COLLECTION_ID = 'atemschutzRechnung';
export const ATEMSCHUTZ_CONFIG_COLLECTION_ID = 'atemschutzConfig';
export const ATEMSCHUTZ_RECHNUNG_CONFIG_DOC = 'rechnung';

/**
 * Die beiden Tarife des Kostenersatz-Katalogs (LGBl. Nr. 77/2023, Kategorie 5
 * „Füllen von Pressluftflaschen"). Kein eigener Preis in dieser Anwendung: Das
 * Landesgesetzblatt gilt landesweit gleich, eine zweite pflegbare Zahl würde
 * driften.
 */
export const TARIF_BIS_6L = '5.01';
export const TARIF_UEBER_6L = '5.02';
export const FUELLUNG_TARIF_IDS: string[] = [TARIF_BIS_6L, TARIF_UEBER_6L];

export type FuellungRechnungStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export const RECHNUNG_STATUSES: FuellungRechnungStatus[] = ['draft', 'sent', 'paid', 'cancelled'];

export interface AtemschutzEmpfaenger {
  id?: string;
  /**
   * Name der Feuerwehr, wie er in `AtemschutzGeraet.feuerwehr` steht — der
   * Schlüssel für die Zuordnung. Verglichen über `normalizeCode`, dieselbe
   * Vereinheitlichung wie bei `verrechnenVorgabe`.
   */
  feuerwehr: string;
  /** Anzeigename auf der Rechnung, z.B. „Freiwillige Feuerwehr Winden am See". */
  name: string;
  ansprechpartner?: string;
  adresse: string;
  email: string;
  telefon?: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Die Felder, die in die Rechnung kopiert werden. */
export type EmpfaengerKopie = Pick<
  AtemschutzEmpfaenger,
  'feuerwehr' | 'name' | 'ansprechpartner' | 'adresse' | 'email' | 'telefon'
>;

export interface AtemschutzRechnungPosition {
  fuellungId: string;
  /**
   * Kopien aus der Füllung. Die Rechnung bleibt damit ohne Join lesbar und
   * ändert sich nicht rückwirkend, wenn jemand die Füllung korrigiert.
   */
  zeitpunkt: string;
  flaschenNummer?: string;
  volumenLiter?: number;
  firecallName?: string;
  anzahl: number;
  rateId: string;
  /** Beim Erstellen eingefroren — eine gestellte Rechnung ändert sich nie. */
  einzelpreis: number;
  summe: number;
}

export interface AtemschutzRechnung {
  id?: string;
  nummer: string;
  status: FuellungRechnungStatus;
  /**
   * Eingebettete Kopie. Ein Verweis ins Adressbuch änderte eine bereits
   * verschickte Rechnung rückwirkend, sobald jemand die Adresse pflegt.
   */
  empfaenger: EmpfaengerKopie;
  /** Herkunft im Adressbuch. Nur Nachweis, wird nie nachgelesen. */
  empfaengerId?: string;
  positionen: AtemschutzRechnungPosition[];
  rateVersion: string;
  summe: number;
  /** Rechnungsdatum, ISO. */
  datum: string;
  /** Aus den Positionen abgeleitet — für Betreff und PDF-Kopf. */
  zeitraumVon: string;
  zeitraumBis: string;
  bemerkung?: string;
  emailSentAt?: string;
  bezahltAm?: string;
  storniertAm?: string;
  storniertVon?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AtemschutzRechnungConfig {
  ccEmail: string;
  subjectTemplate: string;
  bodyTemplate: string;
  /**
   * Wofür die Rechnung ausgestellt wird, als Satz über der Tabelle.
   *
   * Absender und Bankverbindung stehen **nicht** hier, sondern in den
   * Gruppen-Stammdaten (`common/groupStammdaten.ts`): Dieselbe IBAN an zwei
   * Orten liefe auseinander, sobald sich das Konto ändert, und der
   * Kostenersatz braucht sie ebenso.
   */
  leistungstext: string;
  /** Tage ab Rechnungsdatum. 0 heißt: kein Zahlungsziel angeben. */
  zahlungszielTage: number;
  /**
   * Hinweis zur Umsatzsteuer. Bewusst ohne Vorgabetext: Ob und wie eine
   * Feuerwehr hier unternehmerisch tätig wird, ist ihre eigene steuerliche
   * Beurteilung und gehört nicht als Behauptung in den Code.
   */
  ustHinweis: string;
  vorgabeTarif: string;
  /** Laufende Nummer je Jahr, in einer Transaktion hochgezählt. */
  nummernkreis?: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Vorgabetarif ist `5.01` und **nicht** der aus dem Volumen abgeleitete: In
 * der Praxis wird auch für eine 6,8-l-CFK der 6-l-Preis verrechnet. Das
 * Volumen steht in der Position nur zur Information.
 */
export const DEFAULT_RECHNUNG_CONFIG: AtemschutzRechnungConfig = {
  ccEmail: '',
  subjectTemplate: 'Rechnung {{ rechnung.nummer }} — Füllen von Pressluftflaschen',
  bodyTemplate: `Sehr geehrte Kameraden,

anbei die Rechnung {{ rechnung.nummer }} über {{ rechnung.flaschen }} Flaschenfüllungen {{ rechnung.zeitraumSatz }}.

Mit kameradschaftlichen Grüßen`,
  leistungstext:
    'Für das Füllen von Pressluftflaschen Ihrer Feuerwehr verrechnen wir die folgenden Positionen.',
  zahlungszielTage: 14,
  ustHinweis: '',
  vorgabeTarif: TARIF_BIS_6L,
};

/**
 * Zahlungsziel als ISO-Datum, oder `undefined` bei `tage <= 0`.
 *
 * Rein, damit PDF und Vorschau dasselbe Datum zeigen.
 */
export function zahlungszielDatum(rechnungsdatum: string, tage: number): string | undefined {
  if (!rechnungsdatum || !tage || tage <= 0) return undefined;
  const datum = new Date(rechnungsdatum);
  if (Number.isNaN(datum.getTime())) return undefined;
  // `setUTCDate` und nicht `setDate`: In Ortszeit verschiebt die
  // Zeitumstellung das Ergebnis um eine Stunde, und auf einem UTC-Server
  // (Cloud Run rendert das PDF) fiele das Zahlungsziel dann einen Tag zu
  // früh aus.
  datum.setUTCDate(datum.getUTCDate() + tage);
  return datum.toISOString();
}

/** Zu verrechnen und noch keiner Rechnung zugeordnet. */
export function offeneFuellungen(fuellungen: AtemschutzFuellung[]): AtemschutzFuellung[] {
  return fuellungen.filter((f) => f.verrechnen && !f.rechnungId);
}

export interface FeuerwehrBuendel {
  /** Schreibweise der ersten Zeile — die Anzeige nimmt sie unverändert. */
  feuerwehr: string;
  fuellungen: AtemschutzFuellung[];
  /** Summe der `anzahl`; die Sammelerfassung zählt voll. */
  flaschen: number;
  summe: number;
  von: string;
  bis: string;
}

/**
 * Bündelt die offenen Füllungen je Feuerwehr — die Einheit, an die adressiert
 * wird. Zusammengefasst wird über `normalizeCode`: „Winden am See" und
 * „winden-am-see" sind dieselbe Wehr, sonst entstünden zwei Rechnungen.
 *
 * Füllungen ohne Feuerwehr bekommen das Bündel `''` und verschwinden damit
 * nicht still — ohne Empfänger ist die Zeile trotzdem sichtbar und lässt sich
 * im Füllprotokoll nachtragen.
 */
export function fuellungenNachFeuerwehr(
  fuellungen: AtemschutzFuellung[],
  preise: Record<string, number>,
  vorgabeTarif: string,
): FeuerwehrBuendel[] {
  const buendel = new Map<string, FeuerwehrBuendel>();

  for (const fuellung of fuellungen) {
    const key = normalizeCode(fuellung.feuerwehr ?? '');
    const vorhanden = buendel.get(key);
    const [position] = rechnungPositionen([{ fuellung }], preise, vorgabeTarif);

    if (!vorhanden) {
      buendel.set(key, {
        feuerwehr: fuellung.feuerwehr ?? '',
        fuellungen: [fuellung],
        flaschen: fuellung.anzahl,
        summe: position.summe,
        von: fuellung.zeitpunkt,
        bis: fuellung.zeitpunkt,
      });
      continue;
    }

    vorhanden.fuellungen.push(fuellung);
    vorhanden.flaschen += fuellung.anzahl;
    vorhanden.summe = runde(vorhanden.summe + position.summe);
    if (fuellung.zeitpunkt < vorhanden.von) vorhanden.von = fuellung.zeitpunkt;
    if (fuellung.zeitpunkt > vorhanden.bis) vorhanden.bis = fuellung.zeitpunkt;
  }

  return [...buendel.values()].sort((a, b) => a.feuerwehr.localeCompare(b.feuerwehr, 'de'));
}

export interface PositionEingabe {
  fuellung: AtemschutzFuellung;
  /** Aus den Stammdaten nachgeschlagen, rein informativ. */
  volumenLiter?: number;
  /** Vom Benutzer gewählt; ohne Angabe gilt der Vorgabetarif. */
  tarifId?: string;
}

/** Auf Cent runden — Gleitkomma summiert sich sonst sichtbar auf. */
function runde(value: number): number {
  return Math.round(value * 100) / 100;
}

export function rechnungPositionen(
  eingaben: PositionEingabe[],
  preise: Record<string, number>,
  vorgabeTarif: string,
): AtemschutzRechnungPosition[] {
  return eingaben.map(({ fuellung, volumenLiter, tarifId }) => {
    const rateId = tarifId ?? vorgabeTarif;
    const einzelpreis = preise[rateId];
    if (typeof einzelpreis !== 'number') {
      throw new Error(`Kein Preis für Tarif ${rateId}`);
    }
    return {
      fuellungId: fuellung.id ?? '',
      zeitpunkt: fuellung.zeitpunkt,
      flaschenNummer: fuellung.flaschenNummer,
      volumenLiter,
      firecallName: fuellung.firecallName,
      anzahl: fuellung.anzahl,
      rateId,
      einzelpreis,
      summe: runde(fuellung.anzahl * einzelpreis),
    };
  });
}

export function rechnungSumme(positionen: AtemschutzRechnungPosition[]): number {
  return runde(positionen.reduce((sum, p) => sum + p.summe, 0));
}

export function zeitraumDerPositionen(positionen: AtemschutzRechnungPosition[]): {
  von: string;
  bis: string;
} {
  const zeiten = positionen.map((p) => p.zeitpunkt).sort();
  return { von: zeiten[0] ?? '', bis: zeiten[zeiten.length - 1] ?? '' };
}

/**
 * Zeitraum als Text: bei gleichem Tag nur das Datum, sonst die Spanne.
 *
 * Eine Rechnung über eine einzelne Füllung trug bisher „12.03.2026 –
 * 12.03.2026". Das Formatieren kommt von außen, damit PDF und Mailvorlage
 * dieselbe Regel, aber ihre eigene Darstellung benutzen.
 */
export function zeitraumText(
  von: string,
  bis: string,
  formatiere: (iso: string) => string,
): string {
  const vonText = von ? formatiere(von) : '';
  const bisText = bis ? formatiere(bis) : '';
  if (!vonText) return bisText;
  if (!bisText || vonText === bisText) return vonText;
  return `${vonText} – ${bisText}`;
}

/**
 * Ist die Leistung an einem einzigen Tag erbracht worden?
 *
 * Entscheidet über die Beschriftung: Bei einem Tag heißt es auf einer
 * Rechnung *Leistungsdatum*, bei mehreren *Leistungszeitraum*.
 */
export function istEinTag(von: string, bis: string, formatiere: (iso: string) => string): boolean {
  if (!von || !bis) return true;
  return formatiere(von) === formatiere(bis);
}

/**
 * Der Zeitraum als Satzteil: „am 30.08.2026" oder „von … bis …".
 *
 * Eigener Platzhalter neben `zeitraum`: Eine Vorlage schreibt „im Zeitraum
 * {{ rechnung.zeitraum }}", und das liest sich bei einem einzigen Tag falsch.
 * Der bloße `zeitraum` bleibt unverändert, damit gespeicherte Vorlagen
 * weiterhin das tun, was dort steht.
 */
export function zeitraumSatz(
  von: string,
  bis: string,
  formatiere: (iso: string) => string,
): string {
  const vonText = von ? formatiere(von) : '';
  const bisText = bis ? formatiere(bis) : '';
  if (!vonText && !bisText) return '';
  if (!vonText) return `am ${bisText}`;
  if (!bisText || vonText === bisText) return `am ${vonText}`;
  return `von ${vonText} bis ${bisText}`;
}

export function empfaengerFuerFeuerwehr(
  empfaenger: AtemschutzEmpfaenger[],
  feuerwehr?: string,
): AtemschutzEmpfaenger | undefined {
  const needle = normalizeCode(feuerwehr ?? '');
  if (!needle) return undefined;
  return empfaenger.find((e) => e.active && normalizeCode(e.feuerwehr) === needle);
}

export function empfaengerKopie(empfaenger: AtemschutzEmpfaenger): EmpfaengerKopie {
  const kopie: EmpfaengerKopie = {
    feuerwehr: empfaenger.feuerwehr,
    name: empfaenger.name,
    adresse: empfaenger.adresse,
    email: empfaenger.email,
  };
  if (empfaenger.ansprechpartner) {
    kopie.ansprechpartner = empfaenger.ansprechpartner;
  }
  if (empfaenger.telefon) kopie.telefon = empfaenger.telefon;
  return kopie;
}

/**
 * `ATS-<Jahr>-<lfd>`, dreistellig aufgefüllt. `zaehler` ist der bisherige
 * Stand, die neue Nummer ist die nächste.
 */
export function naechsteRechnungsnummer(jahr: number, zaehler: number): string {
  return `ATS-${jahr}-${String(zaehler + 1).padStart(3, '0')}`;
}

/**
 * Erlaubte Statuswechsel. Storno ist aus jedem nicht stornierten Status
 * möglich; aus dem Storno führt kein Weg zurück — eine stornierte Rechnung
 * bleibt als Beleg stehen, eine neue wird neu erstellt.
 */
export function rechnungStatusErlaubt(
  von: FuellungRechnungStatus,
  nach: FuellungRechnungStatus,
): boolean {
  if (von === 'cancelled') return false;
  if (nach === 'cancelled') return true;
  if (von === 'draft') return nach === 'sent';
  if (von === 'sent') return nach === 'paid';
  return false;
}

export function rechnungStatusFarbe(
  status: FuellungRechnungStatus,
): 'default' | 'primary' | 'success' | 'error' {
  switch (status) {
    case 'draft':
      return 'default';
    case 'sent':
      return 'primary';
    case 'paid':
      return 'success';
    case 'cancelled':
      return 'error';
  }
}
