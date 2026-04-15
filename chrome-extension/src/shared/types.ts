// Re-export Firestore types from main app.
// These are pure type definitions with no runtime dependencies on Next.js.
export type {
  Firecall,
  FirecallItem,
  Diary,
} from '../../../src/components/firebase/firestore';

// Re-export collection constants
export {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../../../src/components/firebase/firestore';
