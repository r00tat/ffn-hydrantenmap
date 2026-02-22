import type { NextPage } from 'next';
import WetterstationHistory from '../../../components/Wetter/WetterstationHistory';

interface Props {
  params: Promise<{ stationId: string }>;
}

const WetterStationPage: NextPage<Props> = async ({ params }) => {
  const { stationId } = await params;
  return <WetterstationHistory stationId={stationId} />;
};

export default WetterStationPage;
