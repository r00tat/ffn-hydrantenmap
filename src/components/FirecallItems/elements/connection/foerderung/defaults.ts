/**
 * Vorbelegungen der Löschwasserförderung — **ohne Karte und ohne React**.
 *
 * Eigene Datei, weil neben der Fassade `foerderung.ts` (die über
 * `connectionDisplayPositions` Leaflet mitzieht) auch der MCP-Server diese
 * Werte braucht, und der läuft im Node-Prozess ohne `window`.
 */

/**
 * Vorbelegungen, alle belegt — Herkunft je Wert in
 * docs/loeschwasserfoerderung.md.
 */
export const FOERDERUNG_DEFAULTS = {
  /** Normale Fördermenge einer Zubringleitung. */
  foerderMenge: 1000,
  /** 5 bar Strahlrohr + 1 bar Verteiler und Löschleitung. */
  zielDruck: 6,
  /** PFPN 10-1000 im Dauerbetrieb; 10 bar wäre der Nennwert ohne Reserve. */
  pumpenAusgangsdruck: 8,
  /** Mindest-Eingangsdruck an der nächsten Pumpe. */
  pumpenEingangsdruck: 1.5,
  /** Nennförderstrom FPN 10-1000. */
  pumpenNennstrom: 1000,
  paralleleLeitungen: 1,
};
