/**
 * Art eines Einsatzes. Eigenes Modul ohne Abhängigkeiten, damit
 * `common/geraet.ts` (Client, Server Actions, Import) den Typ ohne die
 * Firestore-Typen von `components/firebase/firestore.ts` nutzen kann.
 *
 * Persistierter Wert am Einsatz-Dokument (`Firecall.art`); fehlt er, gilt
 * `einsatz`.
 */
export type FirecallArt = 'einsatz' | 'uebung' | 'sonstiges';

export const FIRECALL_ARTEN: readonly FirecallArt[] = ['einsatz', 'uebung', 'sonstiges'];
