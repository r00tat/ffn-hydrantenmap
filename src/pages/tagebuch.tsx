import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const EinsatzTagebuch = dynamic(
  () => {
    return import('../components/pages/EinsatzTagebuch');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <EinsatzTagebuch />;
};

export default Home;
