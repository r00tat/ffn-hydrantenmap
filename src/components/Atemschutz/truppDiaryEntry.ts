import type {
  AtemschutzTrupp,
  Druckabfrage,
  TagebuchEreignis,
} from '../../common/atemschutz';
import { truppLabel } from '../../common/atemschutz';
import type { Diary } from '../firebase/firestore';

/** Auch die freie Statusmeldung — sie bekommt keinen Merker am Trupp. */
export type TagebuchAnlass = TagebuchEreignis | 'meldung';

/**
 * Was der Eintrag vom Trupp braucht.
 *
 * Bewusst **nicht** `AtemschutzTrupp`: Beim erneuten Einsatz entsteht der
 * Eintrag aus einer eben angelegten Zeile, die ihre Systemfelder noch nicht
 * trägt — die setzt der Store beim Schreiben. Für den Text sind sie ohnehin
 * ohne Belang.
 */
export type TruppDiaryTrupp = Omit<
  AtemschutzTrupp,
  'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
>;

/**
 * Labels für den Tagebucheintrag. Werden vom Aufrufer übergeben, der Zugriff
 * auf `useTranslations` hat — so bleibt dieses Modul rein und testbar.
 * Gleiches Muster wie `buildFoerderungDiaryEntry`.
 *
 * Die Titel bekommen die Bausteine einzeln und **nicht** zusammengeklebt: Ein
 * Satz aus deutschen Fragmenten ergibt im Englischen keinen Satz. Welche
 * Variante daraus wird, entscheidet die Label-Funktion über den passenden
 * Schlüssel.
 */
export interface TruppDiaryLabels {
  auftrag: (v: { trupp: string; auftrag?: string; ziel?: string }) => string;
  amZiel: (v: { trupp: string; ziel?: string }) => string;
  rueckzug: (v: { trupp: string }) => string;
  rueckkehr: (v: { trupp: string; einheit?: string }) => string;
  meldung: (v: { trupp: string; text?: string }) => string;
  /** „Druck: 240 bar" */
  druck: (bar: number) => string;
  /** „Abmarschdruck: 300 bar" */
  abmarschdruck: (bar: number) => string;
  /** „Einsatzdauer: 22 min" */
  einsatzdauer: (minuten: number) => string;
}

export interface TruppDiaryInput {
  anlass: TagebuchAnlass;
  /**
   * Der Trupp **nach** dem Schreibvorgang.
   *
   * Der Aufrufer reicht `{ ...trupp, ...patch }` herein: Nach `updateTrupp`
   * ist das lokale Objekt veraltet, und der Eintrag beschriebe sonst einen
   * Auftrag, der im Dokument schon steht.
   */
  trupp: TruppDiaryTrupp;
  /** Die Meldung, aus der das Ereignis kommt — bei Ankunft, Rückzug, Meldung. */
  abfrage?: Druckabfrage;
  /** Zeitstempel des Eintrags. */
  zeitpunkt: string;
  labels: TruppDiaryLabels;
}

/** Minuten zwischen Abmarsch und Rückkehr; `undefined`, wenn eines fehlt. */
function einsatzdauerMin(trupp: TruppDiaryTrupp): number | undefined {
  const von = new Date(trupp.abmarschZeit ?? '').getTime();
  const bis = new Date(trupp.rueckkehrZeit ?? '').getTime();
  if (Number.isNaN(von) || Number.isNaN(bis) || bis <= von) return undefined;
  return Math.round((bis - von) / 60_000);
}

/**
 * Reiner Builder für den Einsatztagebuch-Eintrag eines Atemschutztrupps.
 *
 * Aufbau: ein lesbarer **Satz** als Information, der Kontext als Anmerkung.
 * Die taktische Einheit steht doppelt — in der Spalte „Meldung an" und als
 * erste Zeile der Anmerkung: Im Tagebuch-Ausdruck ist die Anmerkung das, was
 * gelesen wird.
 *
 * Das Einsatzziel steht in der Anmerkung, **wenn es nicht im Titel steht**.
 * Beim Einsatzauftrag und bei der Ankunft trägt es der Satz; bei Rückzug,
 * Rückkehr und Meldung fehlt dort der Ort, und ohne ihn ist die Zeile im
 * Tagebuch nicht zu verorten.
 *
 * Die Mitglieder stehen nur beim Einsatzauftrag: Sie ändern sich während einer
 * Bereitstellung nicht, in jedem Eintrag wären sie Wiederholung.
 */
export function buildTruppDiaryEntry(input: TruppDiaryInput): Diary {
  const { trupp, anlass, abfrage, labels } = input;
  const name = truppLabel(trupp);
  const einheit = trupp.entsendetAn?.trim() || undefined;
  const ziel = trupp.einsatzziel?.trim() || undefined;
  const auftrag = trupp.auftrag?.trim() || undefined;

  let titel: string;
  // Steht das Ziel schon im Satz, wäre die Zeile darunter eine Wiederholung.
  let zielInAnmerkung = true;
  let druckZeile: string | undefined;
  let dauerZeile: string | undefined;
  let mitgliederZeile: string | undefined;

  const abfrageDruck =
    typeof abfrage?.druck === 'number' ? labels.druck(abfrage.druck) : undefined;

  switch (anlass) {
    case 'auftrag':
      titel = labels.auftrag({ trupp: name, auftrag, ziel });
      zielInAnmerkung = false;
      if (trupp.mitglieder.length > 0) {
        mitgliederZeile = trupp.mitglieder.join(', ');
      }
      if (typeof trupp.druckAbmarsch === 'number') {
        druckZeile = labels.abmarschdruck(trupp.druckAbmarsch);
      }
      break;
    case 'amZiel':
      titel = labels.amZiel({ trupp: name, ziel });
      zielInAnmerkung = false;
      druckZeile = abfrageDruck;
      break;
    case 'rueckzug':
      titel = labels.rueckzug({ trupp: name });
      druckZeile = abfrageDruck;
      break;
    case 'rueckkehr':
      titel = labels.rueckkehr({ trupp: name, einheit });
      if (typeof trupp.druckRueckkehr === 'number') {
        druckZeile = labels.druck(trupp.druckRueckkehr);
      }
      {
        const dauer = einsatzdauerMin(trupp);
        if (dauer !== undefined) dauerZeile = labels.einsatzdauer(dauer);
      }
      break;
    default:
      titel = labels.meldung({ trupp: name, text: abfrage?.bemerkung?.trim() });
      druckZeile = abfrageDruck;
      break;
  }

  // Die Bemerkung der Meldung steht schon im Titel — sie dort *und* darunter
  // zu wiederholen wäre dieselbe Aussage zweimal.
  const bemerkung =
    anlass === 'meldung' ? undefined : abfrage?.bemerkung?.trim() || undefined;

  const zeilen = [
    einheit,
    zielInAnmerkung ? ziel : undefined,
    mitgliederZeile,
    druckZeile,
    dauerZeile,
    bemerkung,
  ].filter((zeile): zeile is string => !!zeile);

  return {
    type: 'diary',
    art: 'M',
    datum: input.zeitpunkt,
    name: titel,
    von: name,
    ...(einheit ? { an: einheit } : {}),
    beschreibung: zeilen.join('\n'),
  };
}
