'use client';

import { doc } from 'firebase/firestore';
import { setDoc } from '../../../../../lib/firestoreClient';
import { firestore } from '../../../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  type MultiPointItem,
} from '../../../../firebase/firestore';
import type { LatLngPosition } from '../../../../../common/geo';
import { terrainClient } from '../../../../../common/terrain/terrainClient';
import { fetchElevations } from './elevationAction';
import {
  elevationSignature,
  elevationTodo,
  FALLBACK_SAMPLE_SPACING_M,
  foerderungSamples,
  isFoerderungEnabled,
} from './elevationProfile';

const clearedElevation = {
  elevationProfile: '',
  elevationFor: '',
  elevationFailed: '',
  elevationSource: '',
  elevationLevel: '',
  elevationSpacing: '',
};

interface ElevationLookup {
  elevations: number[];
  source: 'terrain' | 'opentopodata';
  level?: 'detail' | 'overview';
}

/**
 * Höhen aus dem eigenen Höhenmodell.
 *
 * Zuerst gefragt, weil es 1 m Raster hat gegen 25 m bei EU-DEM und an keiner
 * fremden Verfügbarkeitszusage hängt. Es kann aber Lücken haben — außerhalb des
 * Burgenlands gibt es keine Kacheln —, und ein einzelner fehlender Wert macht
 * das ganze Profil ungültig: ein löchriges Profil erzeugt Drücke, die niemand
 * nachprüfen kann.
 *
 * Wirft nicht. Ohne Worker (Server, Test) und bei jedem Fehler gilt die
 * Rückfallebene.
 */
async function terrainElevations(
  positions: LatLngPosition[]
): Promise<ElevationLookup | undefined> {
  try {
    const samples = await terrainClient().sample(positions);
    if (samples.some((sample) => sample === null)) return undefined;
    const filled = samples.filter((sample) => sample !== null);
    if (filled.length !== positions.length) return undefined;
    return {
      elevations: filled.map((sample) => sample.heightM),
      // Die **gröbste** gelieferte Stufe: sie bestimmt, wie genau das Profil
      // insgesamt ist. Die feinste zu nennen wäre geschmeichelt.
      level: filled.some((sample) => sample.level === 'overview')
        ? 'overview'
        : 'detail',
      source: 'terrain',
    };
  } catch (err) {
    console.warn('own terrain model unavailable', err);
    return undefined;
  }
}

/** Höhen aus OpenTopoData über die Server-Action. Wirft nicht. */
async function openTopoElevations(
  firecallId: string,
  positions: LatLngPosition[]
): Promise<ElevationLookup | undefined> {
  const elevations = await fetchElevations(firecallId, positions).catch(
    (err) => {
      console.error('elevation lookup failed', err);
      return undefined;
    }
  );
  return elevations
    ? { elevations, source: 'opentopodata' }
    : undefined;
}

/**
 * Zieht das Höhenprofil einer Leitung nach: nach dem Zeichnen, nach jeder
 * Änderung an den Punkten, nach einem neuen Straßenverlauf und nach dem
 * Einschalten des Rechners.
 *
 * Wirft nicht. Die Änderung am Element ist zu diesem Zeitpunkt schon
 * gespeichert; ein Ausfall der Höhenabfrage darf sie nicht als Fehler
 * erscheinen lassen. Er hinterlässt stattdessen `elevationFailed`, und der
 * Dialog rechnet mit dem eingegebenen Höhenunterschied.
 *
 * Gibt die geschriebenen Felder zurück, damit ein Aufrufer weiterarbeiten kann,
 * ohne erneut zu lesen.
 */
export async function ensureConnectionElevation(
  firecallId: string,
  item: MultiPointItem,
  /**
   * `force`: auch dann abfragen, wenn für diese Abtastung schon ein Fehlschlag
   * vermerkt ist. Das ist der Knopf „erneut versuchen" im Rechner — ohne ihn
   * bliebe eine Leitung nach einem einzigen Aussetzer des Höhendienstes für
   * immer bei der Handeingabe, denn genau das verhindert der Vermerk sonst
   * absichtlich.
   */
  { force = false }: { force?: boolean } = {}
): Promise<Record<string, string> | undefined> {
  const todo = elevationTodo(item);
  if (!item.id) return undefined;
  if (todo === 'none' && !(force && isFoerderungEnabled(item))) {
    return undefined;
  }

  let update: Record<string, string>;
  if (todo === 'clear') {
    update = { ...clearedElevation };
  } else {
    const samples = foerderungSamples(item);
    const positions = samples.map(({ position }) => position);
    const spacingM = FALLBACK_SAMPLE_SPACING_M;
    const signature = elevationSignature(samples, spacingM);

    const lookup =
      (await terrainElevations(positions)) ??
      (await openTopoElevations(firecallId, positions));

    update = lookup
      ? {
          elevationProfile: JSON.stringify(lookup.elevations),
          elevationFor: signature,
          elevationFailed: '',
          elevationSource: lookup.source,
          // Leer statt weggelassen: geschrieben wird mit `merge`, und ein
          // weggelassenes Feld ließe die Stufe einer früheren Terrain-Abfrage
          // an einem Profil aus der Rückfallebene stehen.
          elevationLevel: lookup.level ?? '',
          elevationSpacing: String(spacingM),
        }
      : {
          elevationProfile: '',
          // Die Signatur wird auch beim Fehlschlag gesetzt: Sie hält fest, wofür
          // die Höhen nicht zu bekommen waren, und verhindert damit eine neue
          // Abfrage bei jeder weiteren Änderung.
          elevationFor: signature,
          elevationFailed: 'true',
          elevationSource: '',
          elevationLevel: '',
          elevationSpacing: String(spacingM),
        };
  }

  await setDoc(
    doc(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      FIRECALL_ITEMS_COLLECTION_ID,
      item.id
    ),
    update,
    { merge: true }
  ).catch((err) => console.error('unable to save elevation profile', err));

  return update;
}
