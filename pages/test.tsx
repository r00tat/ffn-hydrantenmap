import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicPage = dynamic(
  () => {
    return import('../components/TestMap');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return <DynamicPage />;
};

export default Home;
