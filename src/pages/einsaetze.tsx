import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicFahrzeuge = dynamic(
  () => {
    return import('../components/Einsaetze');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <DynamicFahrzeuge />;
};

export default Home;
