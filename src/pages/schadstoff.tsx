import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicSchadstoff = dynamic(
  () => {
    return import('../components/pages/Schadstoff');
  },
  { ssr: false }
);

const SchadstoffStaticPage: NextPage = () => {
  return <DynamicSchadstoff />;
};

export default SchadstoffStaticPage;
