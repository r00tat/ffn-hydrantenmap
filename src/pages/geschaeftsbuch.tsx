import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const Geschaeftsbuch = dynamic(
  () => {
    return import('../components/pages/Geschaeftsbuch');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <Geschaeftsbuch />;
};

export default Home;
