import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import useFirecall from '../../../hooks/useFirecall';
import { filterActiveItems, FirecallItem } from '../../firebase/firestore';
import FirecallItemMarker from './FirecallItemMarker';

export default function FirecallItems() {
  const firecall = useFirecall();
  const records = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    // queryConstraints: options.queryConstraints,
    pathSegments: [firecall?.id || 'unknown', 'item'],
    filterFn: filterActiveItems,
  });

  return (
    <>
      {records.map((record) => (
        <FirecallItemMarker record={record} key={record.id} />
      ))}
    </>
  );
}
