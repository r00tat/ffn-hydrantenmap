import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicEbenen = dynamic(
  () => {
    return import('../components/pages/Layers');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <DynamicEbenen />;
};

export default Home;
