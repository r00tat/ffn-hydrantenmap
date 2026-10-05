/**
 * Die Geräte eines Einsatzes, wie sie die Chrome-Erweiterung nach Sybos
 * überträgt: eine Zeile je Artikel, über die Sybos-ID statt über den Namen.
 *
 * Rein und ohne Firestore — die Erweiterung holt nur die Daten und rechnet
 * mit dieser Funktion, damit Seite und Übertrag nicht auseinanderlaufen
 * (siehe docs/sybos-uebertrag.md).
 */
import type { Geraet, GeraetEinsatz } from './geraet';

export interface SybosGeraetLine {
  /** ID des Artikels in Sybos — Schlüssel der Auswahl und der Anzahl-Felder. */
  sybosId: string;
  name: string;
  /**
   * Kategorie aus dem Sybos-Export („Gerät", „Container", „Bekleidung" …).
   * Die Geräteauswahl in Sybos zeigt je Kategorie eine eigene Liste; die
   * Erweiterung wählt sie über die Beschriftung. Fehlt ohne Stammdaten.
   */
  kategorie?: string;
  /** Summe aus allen Einträgen; fehlt, wenn nichts gezählt wurde. */
  anzahl?: number;
  /** Worin `anzahl` zählt: Stück oder Einsatzstunden. */
  einheit?: 'stk' | 'h';
}

/** Eine Sybos-ID besteht nur aus Ziffern; von Hand angelegte Artikel haben keine. */
const SYBOS_ID_PATTERN = /^\d+$/;

function sybosIdOf(geraetId: string, geraet: Geraet | undefined): string | undefined {
  if (geraet) return geraet.externeId?.trim() || undefined;
  return SYBOS_ID_PATTERN.test(geraetId) ? geraetId : undefined;
}

function sum(values: (number | undefined)[]): number | undefined {
  const numbers = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) : undefined;
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/**
 * Fasst die Einträge je Artikel zusammen. Stunden gehen vor Stück: Ein Gerät
 * mit Verwendungsnachweis in Stunden zählt in Sybos die Stunden.
 *
 * Ohne Stammdaten (Artikel inzwischen gelöscht) gilt die Artikel-ID, die beim
 * Import die Sybos-ID ist. Ein von Hand angelegter Artikel ohne Sybos-ID fehlt
 * — ihn gibt es in Sybos nicht.
 */
export function resolveEinsatzGeraeteForSybos(
  entries: GeraetEinsatz[],
  geraete: Geraet[],
): SybosGeraetLine[] {
  const geraetById = new Map(geraete.map((g) => [g.id, g]));
  const byGeraet = new Map<string, GeraetEinsatz[]>();
  for (const entry of entries) {
    const list = byGeraet.get(entry.geraetId);
    if (list) list.push(entry);
    else byGeraet.set(entry.geraetId, [entry]);
  }

  const lines: SybosGeraetLine[] = [];
  for (const [geraetId, list] of byGeraet) {
    const geraet = geraetById.get(geraetId);
    const sybosId = sybosIdOf(geraetId, geraet);
    if (!sybosId) continue;

    const line: SybosGeraetLine = {
      sybosId,
      name: geraet?.bezeichnung || list[0]?.geraetName || geraetId,
    };
    const kategorie = geraet?.kategorie?.trim();
    if (kategorie) line.kategorie = kategorie;
    const stunden = sum(list.map((e) => e.stunden));
    const menge = sum(list.map((e) => e.menge));
    if (stunden !== undefined) {
      line.anzahl = stunden;
      line.einheit = 'h';
    } else if (menge !== undefined) {
      line.anzahl = menge;
      line.einheit = 'stk';
    }
    lines.push(line);
  }
  return lines.sort((a, b) => collator.compare(a.name, b.name));
}
