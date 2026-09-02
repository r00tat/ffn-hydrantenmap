import type { FuellungInput } from '../../common/atemschutz';
import type { NeueFuellung } from './atemschutzStore';

export interface FuellungKontext {
  /** `''` = an der Station, ohne Einsatz. */
  firecallId: string;
  firecallName?: string;
  /** Zeitstempel für den Fall, dass die Eingabe keinen mitbringt. */
  now: string;
}

/**
 * Baut das Firestore-Dokument einer Füllung.
 *
 * Eigenes Modul statt einer Methode in `AtemschutzPage`, weil beide Einstiege
 * — Sammelplatz und Füllstation — dasselbe Dokument schreiben müssen. Die
 * Regel „nur setzen, was einen Wert hat" gilt hier überall, mit zwei bewussten
 * Ausnahmen: `firecallId` und `verrechnen` stehen immer im Dokument, damit sie
 * abfragbar bleiben.
 *
 * Der Einsatzbezug kommt aus der Eingabe, wenn sie einen mitbringt, und sonst
 * aus dem Kontext. Am Sammelplatz steht er fest und der Dialog stellt ihn nicht
 * zur Wahl; auf der zentralen Seite ist er ein Feld. Ohne diesen Vorrang
 * übernähme eine dort bearbeitete Zeile den *Filter* als Einsatz — und eine
 * Einsatzfüllung, die bei Filter „Alle" korrigiert wird, verlöre ihren.
 */
export function buildFuellungDocument(
  input: FuellungInput,
  kontext: FuellungKontext,
): NeueFuellung {
  const firecallId = input.firecallId ?? kontext.firecallId;
  const firecallName =
    input.firecallId !== undefined ? input.firecallName : kontext.firecallName;
  return {
    ...(input.geraetId ? { geraetId: input.geraetId } : {}),
    ...(input.flaschenNummer?.trim()
      ? { flaschenNummer: input.flaschenNummer.trim() }
      : {}),
    ...(input.feuerwehr?.trim() ? { feuerwehr: input.feuerwehr.trim() } : {}),
    anzahl: input.anzahl,
    ...(typeof input.startdruck === 'number'
      ? { startdruck: input.startdruck }
      : {}),
    enddruck: input.enddruck,
    gefuelltVon: input.gefuelltVon.trim(),
    zeitpunkt: input.zeitpunkt ?? kontext.now,
    ...(input.sichtkontrolle ? { sichtkontrolle: input.sichtkontrolle } : {}),
    ...(input.mangelId ? { mangelId: input.mangelId } : {}),
    ...(input.bemerkung?.trim() ? { bemerkung: input.bemerkung.trim() } : {}),

    firecallId,
    ...(firecallName?.trim() ? { firecallName: firecallName.trim() } : {}),
    ...(input.fuellstationId ? { fuellstationId: input.fuellstationId } : {}),
    ...(input.fuellstationName?.trim()
      ? { fuellstationName: input.fuellstationName.trim() }
      : {}),
    verrechnen: input.verrechnen,
    zweck: input.zweck,
  };
}
