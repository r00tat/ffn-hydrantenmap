import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import Position from '../components/Position';

const DynamicMap = dynamic(
  () => {
    return import('../components/PositionedMap');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <DynamicMap />;
};

export default Home;
