'use client';

import { useEffect, useState } from 'react';
import type { LatLngPosition } from '../common/geo';
import {
  FUELLSTELLE_RADIUS,
  nearestFuellstelle,
  type Fuellstelle,
} from '../components/FirecallItems/elements/connection/pendel/fuellstelle';
import { queryClusters } from '../components/firebase/clusterQuery';

/**
 * Der Hydrant an der Entnahmestelle, aus dem sich die Füllleistung ergibt.
 *
 * Geht über `queryClusters` (Geohash-Umkreissuche in `clusters6`) und damit
 * bewusst nicht über den Kartenbaum: Der Rechner läuft auch auf der Seite
 * „Löschwasserversorgung" und im Panel, und beide sollen keine Kartenebene
 * laden müssen.
 *
 * `undefined` heißt „keiner in Reichweite" **oder** „noch nicht gesucht" —
 * `busy` unterscheidet das. Ohne diese Unterscheidung stünde beim Öffnen kurz
 * „kein Hydrant in der Nähe", und das ist die falsche Antwort auf eine Frage,
 * die noch offen ist.
 */
export default function useFuellstelle(position?: LatLngPosition): {
  fuellstelle?: Fuellstelle;
  busy: boolean;
} {
  const [fuellstelle, setFuellstelle] = useState<Fuellstelle>();
  const [busy, setBusy] = useState(false);

  // Die Koordinaten als Zahlen in den Abhängigkeiten: `position` ist bei jedem
  // Render ein neues Array und als Abhängigkeit eine Endlosschleife.
  const lat = position?.[0];
  const lng = position?.[1];

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      setFuellstelle(undefined);
      return;
    }

    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const clusters = await queryClusters(
          { lat, lng },
          FUELLSTELLE_RADIUS
        );
        if (!cancelled) {
          setFuellstelle(nearestFuellstelle(clusters, { lat, lng }));
        }
      } catch (err) {
        console.error('unable to look up fuellstelle', err);
        if (!cancelled) setFuellstelle(undefined);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return { fuellstelle, busy };
}
