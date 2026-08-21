'use client';

import { useEffect, useState } from 'react';
import type { LatLngPosition } from '../common/geo';
import {
  FUELLSTELLE_RADIUS,
  lookupFuellstelle,
  type FuellstelleLookup,
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
 * `fuellstelle` ist `undefined`, wenn keiner mit Leistungsangabe in Reichweite
 * ist **oder** noch nicht gesucht wurde — `busy` unterscheidet das. Ohne diese
 * Unterscheidung stünde beim Öffnen kurz „kein Hydrant in der Nähe", und das
 * ist die falsche Antwort auf eine Frage, die noch offen ist. `naechsterHydrant`
 * kommt daneben zurück, damit die Meldung sagen kann, welcher Hydrant gefunden
 * wurde, dem aber die Leistung fehlt.
 */
export default function useFuellstelle(
  position?: LatLngPosition
): FuellstelleLookup & { busy: boolean } {
  const [lookup, setLookup] = useState<FuellstelleLookup>({});
  const [busy, setBusy] = useState(false);

  // Die Koordinaten als Zahlen in den Abhängigkeiten: `position` ist bei jedem
  // Render ein neues Array und als Abhängigkeit eine Endlosschleife.
  const lat = position?.[0];
  const lng = position?.[1];

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      setLookup({});
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
          setLookup(lookupFuellstelle(clusters, { lat, lng }));
        }
      } catch (err) {
        console.error('unable to look up fuellstelle', err);
        if (!cancelled) setLookup({});
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return { ...lookup, busy };
}
