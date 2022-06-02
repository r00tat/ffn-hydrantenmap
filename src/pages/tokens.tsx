import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicTokens = dynamic(
  () => {
    return import('../components/Tokens');
  },
  { ssr: false }
);

const Tokens: NextPage = () => {
  return <DynamicTokens />;
};

export default Tokens;
