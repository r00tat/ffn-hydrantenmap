import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicFahrzeuge = dynamic(
  () => {
    return import('../components/pages/Fahrzeuge');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <DynamicFahrzeuge />;
};

export default Home;
