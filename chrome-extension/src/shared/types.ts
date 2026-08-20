// Re-export Firestore types from main app.
// These are pure type definitions with no runtime dependencies on Next.js.
export type {
  Firecall,
  FirecallItem,
  Diary,
  CrewAssignment,
} from '../../../src/components/firebase/firestore';

// Re-export collection constants
export {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
} from '../../../src/components/firebase/firestore';

// Re-export helper functions
export { funktionAbkuerzung } from '../../../src/components/firebase/firestore';

// Re-export the group/Fahrtenbuch collection constants and the pure
// Kilometer-Auflösung the SYBOS transfer uses. Beides ist frei von Next.js und
// Firestore-SDK — die Rechnung gehört in die App (dort steht sie unter Test),
// der Service Worker holt nur die Daten dazu.
export { GROUP_COLLECTION_ID } from '../../../src/components/firebase/firestore';

export {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
} from '../../../src/common/fahrtenbuch';

export type {
  FahrtenbuchEntry,
  FahrtenbuchVehicle,
} from '../../../src/common/fahrtenbuch';

export { resolveEinsatzVehicleKilometers } from '../../../src/common/fahrtenbuchEinsatzKm';

export type {
  EinsatzKmMissing,
  EinsatzVehicleKm,
} from '../../../src/common/fahrtenbuchEinsatzKm';
