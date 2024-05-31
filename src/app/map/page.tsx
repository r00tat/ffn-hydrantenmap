import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicMap = dynamic(() => import('../../components/Map/PositionedMap'), {
  ssr: false,
});

const Home: NextPage = () => {
  return <DynamicMap />;
};

export default Home;
