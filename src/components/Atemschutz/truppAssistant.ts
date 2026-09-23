/**
 * Gesprochener Befehl → Schreibvorgang an einem Atemschutztrupp.
 *
 * „Trupp 1 hat 210 bar", „Schick Trupp Huber in den Keller", „Trupp 2 ist
 * zurück". Das Modell nennt den Trupp so, wie ihn ein Mensch nennt — mit
 * Namen oder mit einem Mitglied. Hier wird daraus die Zeile, der Patch und die
 * Liste der Nebenwirkungen, die der Hook `useTruppAssistant` danach ausführt.
 *
 * Bewusst rein und ohne Firestore, wie `Fahrtenbuch/assistantEntry.ts`: Die
 * Auflösung des Trupps und die Plausibilität des Drucks sind die Stellen, an
 * denen ein Sprachbefehl schiefgeht, und sie sollen ohne Emulator prüfbar
 * sein. Dieselben Grundsätze:
 *
 * 1. **Geraten wird nichts.** Passen zwei Trupps, ist das eine Rückfrage. Eine
 *    Druckabfrage am falschen Trupp verschiebt dessen Rückzugsfrist.
 * 2. **Jede Absage nennt die Alternativen.** Ohne sie rät das Modell beim
 *    nächsten Versuch denselben Namen.
 *
 * Die Rückmeldungen sind fertige deutsche Sätze: Sie werden vorgelesen, und
 * das Vorbild beim Fahrtenbuch hält es genauso.
 *
 * Hintergrund: [docs/atemschutzueberwachung.md](../../../docs/atemschutzueberwachung.md)
 */

import {
  buildDruckabfrage,
  canTransition,
  entsendePatch,
  erneuterEinsatz,
  mitUeberwachungsUid,
  naechsteZuteilung,
  newTruppKey,
  nextBereitstellung,
  rueckkehrPatch,
  sanitizeMitglieder,
  zuteilungPatch,
  type AtemschutzTrupp,
  type Druckabfrage,
  type NeueBereitstellung,
  type TruppPatch,
  type TruppStatus,
} from '../../common/atemschutz';
import { sortierteAbfragen } from '../../common/atemschutzUeberwachung';
import type { TagebuchAnlass } from './truppDiaryEntry';

/** Der Befehl, wie ihn `toolHandlers` aus dem Werkzeugaufruf baut. */
export type TruppCommand =
  | {
      kind: 'create';
      name?: string;
      fireDepartment?: string;
      members?: string[];
      unit?: string;
      note?: string;
    }
  | {
      kind: 'status';
      trupp?: string;
      status: TruppStatus;
      unit?: string;
      pressure?: number;
      mission?: string;
      target?: string;
      monitoredBy?: string;
      time?: string;
    }
  | {
      kind: 'report';
      trupp?: string;
      pressure?: number;
      atTarget?: boolean;
      withdrawing?: boolean;
      note?: string;
      logToDiary?: boolean;
      recordAnyway?: boolean;
    };

export interface TruppPlanContext {
  /** Die aktuelle Zeile je Trupp (`gruppiereTrupps(...).aktuell`). */
  trupps: AtemschutzTrupp[];
  /** ISO-Zeitpunkt des Befehls. */
  jetzt: string;
  /** Wer spricht; bekommt die Warnungen des Trupps. */
  uid: string;
  /** Feuerwehr des Einsatzes (`firecall.fw`), Vorgabe beim Anlegen. */
  fireDepartment?: string;
  /** Für Tests; sonst `newTruppKey`. */
  newKey?: () => string;
}

export type TruppWrite =
  | { art: 'add'; data: NeueBereitstellung }
  | { art: 'update'; truppId: string; patch: TruppPatch }
  | { art: 'abfrage'; abfrage: Druckabfrage };

export type TruppPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      message: string;
      write: TruppWrite;
      /** Der Trupp vor dem Schreibvorgang; beim Anlegen fehlt er. */
      trupp?: AtemschutzTrupp;
      /** Einsatztagebuch-Anlässe, in dieser Reihenfolge. */
      tagebuch: TagebuchAnlass[];
      /** Warntermin neu planen. */
      warnung: boolean;
      /** Push-Token dieses Geräts registrieren. */
      push: boolean;
    };

/**
 * Höchster Druck, den ein Messwert haben darf. 300 bar ist der Nenndruck der
 * üblichen Flasche; darüber bleibt Spielraum für Ablesen und Erwärmung, aber
 * „3000" ist ein verhörter Wert und keine Flasche.
 */
export const MAX_PLAUSIBLER_DRUCK = 330;

/**
 * Ab diesem Abfall zwischen zwei Meldungen fragt der Assistent zurück. Ein
 * Trupp verbraucht in wenigen Minuten keine 100 bar — wohl aber verwechselt
 * die Spracherkennung „zweihundert" und „hundert".
 */
export const MAX_PLAUSIBLER_ABFALL = 100;

const STATUS_TEXT: Record<TruppStatus, string> = {
  bereit: 'bereit',
  zugeteilt: 'zugeteilt',
  imEinsatz: 'im Einsatz',
  zurueck: 'zurück',
  abgemeldet: 'abgemeldet',
};

function tokens(value: string | undefined): string[] {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Tokens ohne das Wort „Trupp": „Trupp 1" und „1" sind derselbe Name. */
function nameTokens(value: string | undefined): string[] {
  return tokens(value).filter((t) => t !== 'trupp');
}

function gleich(a: string[], b: string[]): boolean {
  return a.length > 0 && a.length === b.length && a.every((t, i) => t === b[i]);
}

function enthaeltAlle(heuhaufen: string[], nadeln: string[]): boolean {
  return nadeln.length > 0 && nadeln.every((n) => heuhaufen.includes(n));
}

/** Wie der Trupp in einer Ansage heißt — kurz, weil es vorgelesen wird. */
export function sprechName(trupp: AtemschutzTrupp): string {
  const name = trupp.truppName?.trim();
  if (name) return name;
  if (trupp.mitglieder.length > 0) return `Trupp ${trupp.mitglieder.join(', ')}`;
  return `Trupp ${trupp.feuerwehr}`;
}

function kandidatenText(trupps: AtemschutzTrupp[]): string {
  return trupps
    .map((t) => `${sprechName(t)} (${STATUS_TEXT[t.status]})`)
    .join(', ');
}

function laufende(trupps: AtemschutzTrupp[]): AtemschutzTrupp[] {
  return trupps.filter((t) => t.status !== 'abgemeldet');
}

/**
 * Sucht den gemeinten Trupp unter den laufenden.
 *
 * Die Stufen gehen vom Genauen zum Ungefähren, und die erste Stufe mit einem
 * Treffer entscheidet: „Trupp 1" soll „Trupp 1" treffen und nicht zusätzlich
 * „Trupp 11". Zwei Treffer in derselben Stufe sind eine Rückfrage.
 *
 * `passt` gilt nur, wenn kein Name genannt ist: Mit Namen soll der Trupp
 * gefunden werden, auch wenn er im falschen Zustand ist — die Absage kann
 * dann sagen, *warum* es nicht geht, statt „nicht gefunden".
 */
export function findTrupp(
  trupps: AtemschutzTrupp[],
  gesagt: string | undefined,
  passt: (t: AtemschutzTrupp) => boolean = () => true,
): { trupp: AtemschutzTrupp } | { fehler: string } {
  const kandidaten = laufende(trupps);
  if (kandidaten.length === 0) {
    return { fehler: 'Es ist noch kein Atemschutztrupp angelegt.' };
  }

  const gesucht = nameTokens(gesagt);
  if (gesucht.length === 0) {
    const pool = kandidaten.filter(passt);
    if (pool.length === 1) return { trupp: pool[0] };
    return {
      fehler: `Welcher Trupp ist gemeint? Zur Wahl: ${kandidatenText(pool.length > 0 ? pool : kandidaten)}.`,
    };
  }

  const stufen: ((t: AtemschutzTrupp) => boolean)[] = [
    (t) => gleich(nameTokens(t.truppName), gesucht),
    (t) => gleich(nameTokens(`${t.feuerwehr} ${t.truppName ?? ''}`), gesucht),
    (t) => enthaeltAlle(nameTokens(t.truppName), gesucht),
    (t) => enthaeltAlle(t.mitglieder.flatMap((m) => tokens(m)), gesucht),
  ];

  for (const stufe of stufen) {
    const treffer = kandidaten.filter(stufe);
    if (treffer.length === 1) return { trupp: treffer[0] };
    if (treffer.length > 1) {
      return {
        fehler: `„${gesagt?.trim()}" passt auf mehrere Trupps: ${kandidatenText(treffer)}. Welcher ist gemeint?`,
      };
    }
  }

  return {
    fehler: `Keinen Trupp „${gesagt?.trim()}" gefunden. Vorhanden: ${kandidatenText(kandidaten)}.`,
  };
}

/**
 * Ein gesprochener Zeitpunkt. „11:58" ist heute um 11:58 — oder gestern, wenn
 * das mehr als ein paar Minuten in der Zukunft läge: Ein Einsatz über
 * Mitternacht meldet um 00:05 einen Abmarsch von 23:50.
 */
export function zeitpunktAus(gesagt: string | undefined, jetzt: string): string {
  const wert = gesagt?.trim();
  if (!wert) return jetzt;
  const uhr = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(wert);
  if (uhr) {
    const [h, m, s] = [Number(uhr[1]), Number(uhr[2]), Number(uhr[3] ?? 0)];
    if (h > 23 || m > 59 || s > 59) return jetzt;
    const basis = new Date(jetzt);
    const d = new Date(basis);
    d.setHours(h, m, s, 0);
    if (d.getTime() - basis.getTime() > 5 * 60 * 1000) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString();
  }
  const parsed = Date.parse(wert);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : jetzt;
}

/** Der zuletzt gemessene Druck: die jüngste Abfrage mit Zahl, sonst der Abmarsch. */
function letzteMessung(
  trupp: AtemschutzTrupp,
): { druck: number; zeitpunkt?: string } | undefined {
  const mitDruck = sortierteAbfragen(trupp).filter(
    (a) => typeof a.druck === 'number',
  );
  const letzte = mitDruck[mitDruck.length - 1];
  if (letzte) return { druck: letzte.druck as number, zeitpunkt: letzte.zeitpunkt };
  if (typeof trupp.druckAbmarsch === 'number') {
    return { druck: trupp.druckAbmarsch, zeitpunkt: trupp.abmarschZeit };
  }
  return undefined;
}

function druckFehler(druck: number | undefined): string | undefined {
  if (druck === undefined) return undefined;
  if (!Number.isFinite(druck) || druck < 0) return `${druck} bar ist kein Flaschendruck.`;
  if (druck > MAX_PLAUSIBLER_DRUCK) {
    return `${druck} bar ist mehr, als eine Atemluftflasche fasst.`;
  }
  return undefined;
}

/**
 * Warum eine Meldung auffällig ist — oder `undefined`, wenn sie es nicht ist.
 * Geschrieben wird trotzdem, sobald der Sprecher bestätigt (`recordAnyway`).
 */
export function pruefeMeldung(
  trupp: AtemschutzTrupp,
  cmd: Extract<TruppCommand, { kind: 'report' }>,
): string | undefined {
  const bereich = druckFehler(cmd.pressure);
  if (bereich) return bereich;

  const letzte = letzteMessung(trupp);
  if (typeof cmd.pressure === 'number' && letzte) {
    if (cmd.pressure > letzte.druck) {
      return `${sprechName(trupp)} hatte zuletzt ${letzte.druck} bar, jetzt ${cmd.pressure} bar — der Druck wäre gestiegen.`;
    }
    if (letzte.druck - cmd.pressure > MAX_PLAUSIBLER_ABFALL) {
      return `${sprechName(trupp)} hatte zuletzt ${letzte.druck} bar, jetzt ${cmd.pressure} bar — ein Abfall von ${letzte.druck - cmd.pressure} bar.`;
    }
  }

  const bisher = sortierteAbfragen(trupp);
  if (cmd.atTarget && bisher.some((a) => a.amZiel)) {
    return `${sprechName(trupp)} hat die Ankunft am Einsatzziel schon gemeldet.`;
  }
  if (cmd.withdrawing && bisher.some((a) => a.rueckzug)) {
    return `${sprechName(trupp)} hat den Rückzug schon gemeldet.`;
  }
  return undefined;
}

function optional<K extends string, V>(key: K, value: V | undefined | '') {
  return value === undefined || value === '' ? {} : ({ [key]: value } as Record<K, V>);
}

function planCreate(
  cmd: Extract<TruppCommand, { kind: 'create' }>,
  ctx: TruppPlanContext,
): TruppPlan {
  const mitglieder = sanitizeMitglieder(cmd.members ?? []);
  if (mitglieder.length === 0) {
    return { ok: false, message: 'Wer ist im Trupp? Nenne mindestens ein Mitglied.' };
  }

  const vorhandeneFeuerwehren = [
    ...new Set(laufende(ctx.trupps).map((t) => t.feuerwehr).filter(Boolean)),
  ];
  const feuerwehr =
    cmd.fireDepartment?.trim() ||
    ctx.fireDepartment?.trim() ||
    (vorhandeneFeuerwehren.length === 1 ? vorhandeneFeuerwehren[0] : '');
  if (!feuerwehr) {
    return { ok: false, message: 'Für welche Feuerwehr ist der Trupp?' };
  }

  const name = cmd.name?.trim();
  if (name) {
    const doppelt = laufende(ctx.trupps).find((t) =>
      gleich(nameTokens(t.truppName), nameTokens(name)),
    );
    if (doppelt) {
      return {
        ok: false,
        message: `${sprechName(doppelt)} gibt es schon (${STATUS_TEXT[doppelt.status]}). Welcher Name soll der neue Trupp haben?`,
      };
    }
  }

  const data: NeueBereitstellung = {
    truppKey: (ctx.newKey ?? newTruppKey)(),
    laufendeNummer: 1,
    feuerwehr,
    mitglieder,
    status: 'bereit',
    bereitSeit: ctx.jetzt,
    // Wer den Trupp ansagt, hat die Zeitkontrolle — wie beim Erfassen auf
    // der Überwachungsseite (`handleSaveTrupp`).
    ueberwachungSeit: ctx.jetzt,
    ueberwachungUids: mitUeberwachungsUid(undefined, ctx.uid),
    ...optional('truppName', name),
    ...optional('entsendetAn', cmd.unit?.trim()),
    ...optional('bemerkung', cmd.note?.trim()),
  };
  const bezeichnung = name ?? `Trupp ${mitglieder.join(', ')}`;
  return {
    ok: true,
    message: `${bezeichnung} angelegt (${mitglieder.join(', ')}), bereit.`,
    write: { art: 'add', data },
    tagebuch: [],
    warnung: false,
    push: true,
  };
}

/** Von wo aus der Zielzustand erreichbar ist — über den Patch oder eine neue Zeile. */
function erreichbar(von: TruppStatus, nach: TruppStatus): boolean {
  return canTransition(von, nach) || (von === 'zurueck' && nach !== 'abgemeldet' && nach !== 'zurueck');
}

function planStatus(
  cmd: Extract<TruppCommand, { kind: 'status' }>,
  ctx: TruppPlanContext,
): TruppPlan {
  const gefunden = findTrupp(ctx.trupps, cmd.trupp, (t) =>
    erreichbar(t.status, cmd.status),
  );
  if ('fehler' in gefunden) return { ok: false, message: gefunden.fehler };
  const trupp = gefunden.trupp;
  const name = sprechName(trupp);

  if (trupp.status === cmd.status) {
    return { ok: false, message: `${name} ist bereits ${STATUS_TEXT[cmd.status]}.` };
  }
  const druckProblem = druckFehler(cmd.pressure);
  if (druckProblem) {
    return { ok: false, message: `${druckProblem} Bitte den Druck noch einmal nennen.` };
  }

  const zeit = zeitpunktAus(cmd.time, ctx.jetzt);
  const entsendung = () =>
    entsendePatch({
      entsendetAn: cmd.unit,
      abmarschZeit: zeit,
      druckAbmarsch: cmd.pressure,
      auftrag: cmd.mission,
      einsatzziel: cmd.target,
      ueberwachtVon: cmd.monitoredBy,
      trupp,
      uid: ctx.uid,
    });
  const druckText = typeof cmd.pressure === 'number' ? `, ${cmd.pressure} bar` : '';

  // Eine zurückgekehrte Bereitstellung wird nicht umgeschrieben: Sie ist der
  // Nachweis über den ersten Einsatz. Weiter geht es in einer neuen Zeile.
  if (trupp.status === 'zurueck' && !canTransition('zurueck', cmd.status)) {
    if (cmd.status === 'imEinsatz') {
      const data = erneuterEinsatz({
        vorherige: trupp,
        jetzt: ctx.jetzt,
        entsendung: entsendung(),
        uid: ctx.uid,
      });
      return {
        ok: true,
        message: `${name} erneut im Einsatz${druckText}.`,
        write: { art: 'add', data },
        trupp,
        tagebuch: ['auftrag'],
        warnung: true,
        push: true,
      };
    }
    if (cmd.status === 'zugeteilt') {
      const data = naechsteZuteilung({ vorherige: trupp, jetzt: ctx.jetzt, uid: ctx.uid });
      if (cmd.unit?.trim()) data.entsendetAn = cmd.unit.trim();
      return {
        ok: true,
        message: `${name} wieder zugeteilt${data.entsendetAn ? ` an ${data.entsendetAn}` : ''}.`,
        write: { art: 'add', data },
        trupp,
        tagebuch: [],
        warnung: false,
        push: false,
      };
    }
    if (cmd.status === 'bereit') {
      return {
        ok: true,
        message: `${name} wieder bereit.`,
        write: { art: 'add', data: nextBereitstellung(trupp, ctx.jetzt) },
        trupp,
        tagebuch: [],
        warnung: false,
        push: false,
      };
    }
  }

  if (!canTransition(trupp.status, cmd.status)) {
    const hinweis =
      trupp.status === 'imEinsatz' || trupp.status === 'zugeteilt'
        ? ' Der Trupp muss erst zurück sein.'
        : '';
    return {
      ok: false,
      message: `${name} ist ${STATUS_TEXT[trupp.status]}; ${STATUS_TEXT[cmd.status]} geht von dort nicht.${hinweis}`,
    };
  }

  const update = (
    patch: TruppPatch,
    message: string,
    rest: { tagebuch?: TagebuchAnlass[]; warnung?: boolean; push?: boolean } = {},
  ): TruppPlan => ({
    ok: true,
    message,
    write: { art: 'update', truppId: trupp.id as string, patch },
    trupp,
    tagebuch: rest.tagebuch ?? [],
    warnung: rest.warnung ?? false,
    push: rest.push ?? false,
  });

  switch (cmd.status) {
    case 'zugeteilt': {
      const patch = zuteilungPatch({
        entsendetAn: cmd.unit,
        uebergabeZeit: zeit,
        druckUebergabe: cmd.pressure,
      });
      const an = patch.entsendetAn ?? trupp.entsendetAn;
      return update(patch, `${name} zugeteilt${an ? ` an ${an}` : ''}${druckText}.`);
    }
    case 'imEinsatz':
      return update(entsendung(), `${name} im Einsatz${druckText}. Die Zeitkontrolle läuft.`, {
        tagebuch: ['auftrag'],
        warnung: true,
        push: true,
      });
    case 'zurueck':
      return update(
        rueckkehrPatch({ rueckkehrZeit: zeit, druckRueckkehr: cmd.pressure }),
        `${name} zurück${druckText}.`,
        // Nur aus dem Einsatz ist die Rückkehr ein Einsatzereignis — ein
        // zugeteilter Trupp, der nie drin war, kehrt nicht zurück.
        { tagebuch: trupp.status === 'imEinsatz' ? ['rueckkehr'] : [], warnung: true },
      );
    case 'abgemeldet':
      return update({ status: 'abgemeldet' }, `${name} abgemeldet.`);
    default:
      return { ok: false, message: `${name} ist ${STATUS_TEXT[trupp.status]}.` };
  }
}

function planReport(
  cmd: Extract<TruppCommand, { kind: 'report' }>,
  ctx: TruppPlanContext,
): TruppPlan {
  const gefunden = findTrupp(ctx.trupps, cmd.trupp, (t) => t.status === 'imEinsatz');
  if ('fehler' in gefunden) return { ok: false, message: gefunden.fehler };
  const trupp = gefunden.trupp;
  const name = sprechName(trupp);

  if (trupp.status !== 'imEinsatz') {
    return {
      ok: false,
      message: `${name} ist nicht im Einsatz (${STATUS_TEXT[trupp.status]}). Meldungen gibt es erst nach dem Abmarsch.`,
    };
  }
  const note = cmd.note?.trim();
  if (cmd.pressure === undefined && !cmd.atTarget && !cmd.withdrawing && !note) {
    return { ok: false, message: `Was soll ich für ${name} eintragen?` };
  }
  if (!cmd.recordAnyway) {
    const auffaellig = pruefeMeldung(trupp, cmd);
    if (auffaellig) {
      return { ok: false, message: `${auffaellig} Soll ich das trotzdem eintragen?` };
    }
  }

  const abfrage = buildDruckabfrage(
    {
      druck: cmd.pressure,
      amZiel: cmd.atTarget,
      rueckzug: cmd.withdrawing,
      bemerkung: note,
    },
    { uid: ctx.uid, jetzt: ctx.jetzt },
  );

  // Dieselbe Regel wie `handleDruckabfrage` auf der Seite: Ankunft und
  // Rückzug sind Einsatzereignisse und gehen immer ins Tagebuch; die freie
  // Meldung nur auf Wunsch und nicht zusätzlich zu einer der beiden.
  const bisher = sortierteAbfragen(trupp);
  const zielNeu = !!abfrage.amZiel && !bisher.some((a) => a.amZiel);
  const rueckzugNeu = !!abfrage.rueckzug && !bisher.some((a) => a.rueckzug);
  const tagebuch: TagebuchAnlass[] = [];
  if (zielNeu) tagebuch.push('amZiel');
  if (rueckzugNeu) tagebuch.push('rueckzug');
  if (cmd.logToDiary && !zielNeu && !rueckzugNeu) tagebuch.push('meldung');

  const teile = [
    typeof abfrage.druck === 'number' ? `${abfrage.druck} bar` : '',
    abfrage.amZiel ? 'am Einsatzziel' : '',
    abfrage.rueckzug ? 'Rückzug angetreten' : '',
    note ? `Notiz „${note}"` : '',
  ].filter(Boolean);

  return {
    ok: true,
    message: `${name}: ${teile.join(', ')} eingetragen.`,
    write: { art: 'abfrage', abfrage },
    trupp,
    tagebuch,
    // Der gemessene Verbrauch verschiebt die Fristen, und eine Meldung
    // erledigt die nächste Drittelmarke.
    warnung: true,
    push: false,
  };
}

export function planTruppCommand(
  cmd: TruppCommand,
  ctx: TruppPlanContext,
): TruppPlan {
  switch (cmd.kind) {
    case 'create':
      return planCreate(cmd, ctx);
    case 'status':
      return planStatus(cmd, ctx);
    case 'report':
      return planReport(cmd, ctx);
  }
}

/** Ein Trupp, wie ihn das Modell im Kontext sieht. */
export interface AiTruppContext {
  name: string;
  feuerwehr: string;
  mitglieder: string[];
  status: TruppStatus;
  einheit?: string;
  abmarsch?: string;
  letzterDruck?: number;
  letzterDruckZeit?: string;
  amZiel: boolean;
  rueckzug: boolean;
}

/**
 * Die laufenden Trupps, knapp: Das Modell soll „Trupp 1" auflösen und „wer
 * ist noch drin?" beantworten können. Die ganze Abfrageliste bleibt draußen —
 * der Kontext geht bei jedem Zug neu hinaus.
 */
export function truppKontext(trupps: AtemschutzTrupp[]): AiTruppContext[] {
  return laufende(trupps).map((t) => {
    const letzte = letzteMessung(t);
    const abfragen = sortierteAbfragen(t);
    return {
      name: sprechName(t),
      feuerwehr: t.feuerwehr,
      mitglieder: t.mitglieder,
      status: t.status,
      ...optional('einheit', t.entsendetAn),
      ...optional('abmarsch', t.abmarschZeit),
      ...optional('letzterDruck', letzte?.druck),
      ...optional('letzterDruckZeit', letzte?.zeitpunkt),
      amZiel: abfragen.some((a) => a.amZiel),
      rueckzug: abfragen.some((a) => a.rueckzug),
    };
  });
}
