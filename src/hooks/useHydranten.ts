import { Hydrant } from '../app/api/hydranten/route';
import useFirebaseCollection from './useFirebaseCollection';

export default function useHydranten(): Hydrant[] {
  return useFirebaseCollection<Hydrant>({ collectionName: 'hydrant' });
}
