/**
 * Maskiert Text für den Einbau in eine HTML-Zeichenkette.
 *
 * Gebraucht wird das überall, wo wir HTML als String bauen und an eine Senke
 * übergeben, die ihn per `innerHTML` einsetzt — vor allem Leaflets
 * `L.divIcon({ html })` und `bindTooltip`. React maskiert von sich aus, diese
 * Leaflet-Wege gehen aber an React vorbei.
 *
 * Das `&` muss zuerst ersetzt werden, sonst würden die Semikolons der eigenen
 * Entities gleich wieder mitmaskiert. Beide Anführungszeichen sind dabei, damit
 * die Funktion auch innerhalb eines Attributwerts trägt.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
