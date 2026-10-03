import { useMemo } from 'react';
import { DEFAULT_EINSATZ_FW } from '../components/FirecallItems/einsatzDefaults';
import { OwnFleet, ownFleet } from '../common/vehicleGroups';
import { useFirecall } from './useFirecall';
import { useKostenersatzVehicles } from './useKostenersatzVehicles';

/**
 * Die eigene Feuerwehr im aktuellen Einsatz: die des Einsatzes (sonst die
 * Vorgabe) und ihre vorgefertigten Fahrzeuge — dieselbe Liste wie die
 * Chip-Leiste. Maßstab dafür, welche Fahrzeuge in Listen vorne stehen.
 */
export default function useOwnFleet(): OwnFleet {
  const firecall = useFirecall();
  const { vehicles } = useKostenersatzVehicles();
  const fw = firecall?.fw?.trim() || DEFAULT_EINSATZ_FW;
  return useMemo(
    () =>
      ownFleet(
        fw,
        vehicles.map((v) => v.name),
      ),
    [fw, vehicles],
  );
}
