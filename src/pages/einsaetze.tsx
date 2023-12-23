import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicEinsatz = dynamic(
  () => {
    return import('../components/pages/Einsaetze');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <DynamicEinsatz />;
};

export default Home;
