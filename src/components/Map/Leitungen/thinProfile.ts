'use client';

/**
 * Ausdünnung des Höhenprofils für die Darstellung.
 *
 * Mit der feinen Abtastung kommen bis zu 5.000 Punkte an; das Diagramm ist
 * 600 px breit. Alle zu zeichnen kostet einen SVG-Pfad mit 5.000 Segmenten für
 * eine Auflösung, die kein Bildschirm zeigt.
 *
 * Ausgedünnt wird über Gruppen, aus denen jeweils das **Minimum und das
 * Maximum** übernommen werden. Eine gleichmäßige Ausdünnung — jeder n-te Punkt
 * — würde genau die Kuppen verschlucken, um deren Erkennung es bei der
 * feineren Abtastung überhaupt geht: eine Geländekante zwischen zwei
 * Stützpunkten verschwindet lautlos, und mit ihr die Pumpe, die dort stehen
 * müsste.
 */

/** Punkte im Diagramm. Mehr als das trennt kein Bildschirm auf 600 px. */
export const MAX_CHART_POINTS = 400;

export interface ProfilePoint {
  distance: number;
  elevation: number;
}

export function thinProfile<T extends ProfilePoint>(
  profile: T[],
  maxPoints: number = MAX_CHART_POINTS
): T[] {
  if (profile.length <= maxPoints) return profile;

  // Je Gruppe bis zu zwei Punkte, dazu Anfang und Ende: so bleibt die
  // Obergrenze eingehalten.
  const groups = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const size = profile.length / groups;

  const thinned: T[] = [];
  for (let group = 0; group < groups; group += 1) {
    const start = Math.floor(group * size);
    const end = Math.min(profile.length, Math.floor((group + 1) * size));
    if (end <= start) continue;

    let lowest = start;
    let highest = start;
    for (let i = start + 1; i < end; i += 1) {
      if (profile[i].elevation < profile[lowest].elevation) lowest = i;
      if (profile[i].elevation > profile[highest].elevation) highest = i;
    }

    // In der Reihenfolge der Strecke, nicht der Höhe — sonst liefe der Pfad
    // rückwärts.
    const first = Math.min(lowest, highest);
    const second = Math.max(lowest, highest);
    thinned.push(profile[first]);
    if (second !== first) thinned.push(profile[second]);
  }

  // Anfang und Ende bleiben immer: die Entnahmestelle und das Ziel sind die
  // Punkte, deren Höhe die Rechnung trägt.
  if (thinned[0] !== profile[0]) thinned.unshift(profile[0]);
  const last = profile[profile.length - 1];
  if (thinned[thinned.length - 1] !== last) thinned.push(last);

  return thinned;
}
