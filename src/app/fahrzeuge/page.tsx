'use client';
import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useState } from 'react';

const Fahrzeuge = dynamic(() => import('../../components/pages/Fahrzeuge'), {
  ssr: false,
});

const Home: NextPage = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <>
      <Suspense fallback={<>Loading...</>}>
        {isLoaded && <Fahrzeuge />}
      </Suspense>
    </>
  );
};

export default Home;
