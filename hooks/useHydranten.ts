import { Hydrant } from '../pages/api/hydranten';
import useFirebaseCollection from './useFirebaseCollection';

export default function useHydranten(): Hydrant[] {
  return useFirebaseCollection<Hydrant>('hydrant', []);
}
