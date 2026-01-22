import DynamicMap from '../../../components/Map/DynamicMap';
import EinsatzClient from './EinsatzClient';

export default function EinsatzPage() {
  return (
    <EinsatzClient>
      <DynamicMap />
    </EinsatzClient>
  );
}
