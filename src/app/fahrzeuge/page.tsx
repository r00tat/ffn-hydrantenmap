'use client';
import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import Fahrzeuge from '../../components/pages/Fahrzeuge';

const Home: NextPage = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return <>{isLoaded && <Fahrzeuge />}</>;
};

export default Home;
