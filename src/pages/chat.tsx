import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DynamicChat = dynamic(
  () => {
    return import('../components/pages/Chat');
  },
  { ssr: false }
);

const Chat: NextPage = () => {
  return <DynamicChat />;
};

export default Chat;
