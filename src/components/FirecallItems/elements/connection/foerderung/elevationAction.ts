'use server';

import { actionUserAuthorizedForFirecall } from '../../../../../app/auth';
import type { LatLngPosition } from '../../../../../common/geo';

/**
 * Höhen entlang einer Leitung, aus EU-DEM 25 m (Copernicus) über OpenTopoData.
 *
 * Burgenland GIS bietet keine Punktabfrage: Der öffentliche ArcGIS-Ordner
 * enthält keinen Höhen-Dienst, alle übrigen Ordner verlangen ein Token, und das
 * DGM aus der ALS-Befliegung 2019 gibt es nur als Download. Siehe
 * docs/loeschwasserfoerderung.md.
 *
 * Die öffentliche OpenTopoData-Instanz gibt **keine Verfügbarkeitszusage**
 * (Richtwert 1000 Anfragen/Tag). Deshalb wird nur bei aktivem
 * Löschwasserförderungs-Rechner abgefragt, das Ergebnis an der Leitung
 * gecacht — und ein Ausfall führt nicht zum Fehler, sondern zur Handeingabe
 * des Höhenunterschieds im Dialog.
 *
 * Kein Leaflet in dieser Datei: Ein Import auf Modulebene würde die Action beim
 * Laden mit `window is not defined` abbrechen.
 */

const ELEVATION_URL = 'https://api.opentopodata.org/v1/eudem25m';

/**
 * Muss mit `MAX_ELEVATION_SAMPLES` aus `elevationSampling.ts`
 * zusammenpassen — von dort kann es nicht kommen, weil das Modul Leaflet lädt.
 * Die Schranke hier ist die gegen alles, was aus dem Browser kommt; die im
 * Browser ist nur die Abkürzung dorthin.
 */
const MAX_POSITIONS = 100;

function isValidPosition(position: unknown): position is LatLngPosition {
  return (
    Array.isArray(position) &&
    position.length === 2 &&
    typeof position[0] === 'number' &&
    typeof position[1] === 'number' &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 90 &&
    Math.abs(position[1]) <= 180
  );
}

interface ElevationResponse {
  status?: string;
  results?: { elevation?: number | null }[];
}

/**
 * Die Höhen in m zu den übergebenen Punkten, in derselben Reihenfolge, oder
 * `undefined`, wenn sie nicht zu bekommen sind.
 *
 * Ein einzelner Punkt ohne Höhe (außerhalb des Datensatzes) verwirft die ganze
 * Anfrage: Ein Profil mit Löchern ergibt Druckwerte, die im Einsatz niemand
 * nachprüfen kann — dann ist die Handeingabe die ehrlichere Antwort.
 *
 * Wirft nicht.
 */
export async function fetchElevations(
  firecallId: string,
  positions: LatLngPosition[]
): Promise<number[] | undefined> {
  await actionUserAuthorizedForFirecall(firecallId, { requireWrite: true });

  if (
    !Array.isArray(positions) ||
    positions.length < 2 ||
    !positions.every(isValidPosition)
  ) {
    console.error('fetchElevations: ungültige Punkte', positions);
    return undefined;
  }

  if (positions.length > MAX_POSITIONS) {
    console.error(
      `fetchElevations: ${positions.length} Punkte überschreiten das Limit von ${MAX_POSITIONS}`
    );
    return undefined;
  }

  try {
    const response = await fetch(ELEVATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: positions.map(([lat, lng]) => `${lat},${lng}`).join('|'),
      }),
      // Der Aufrufer wartet, während die Änderung an der Leitung schon
      // gespeichert ist. Das Zeitlimit schützt vor einer Verbindung, die ins
      // Leere läuft — wie beim Straßen-Routing.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '<kein Body>');
      console.error(`fetchElevations: Fehler ${response.status}`, detail);
      return undefined;
    }

    const body = (await response.json()) as ElevationResponse;
    if (body.status !== 'OK' || body.results?.length !== positions.length) {
      console.error('fetchElevations: unerwartete Antwort', body.status);
      return undefined;
    }

    const elevations = body.results.map((result) => result.elevation);
    if (elevations.some((value) => typeof value !== 'number')) {
      console.error('fetchElevations: Punkt ohne Höhe im Datensatz');
      return undefined;
    }

    return elevations as number[];
  } catch (err) {
    console.error('fetchElevations: Aufruf fehlgeschlagen', err);
    return undefined;
  }
}
