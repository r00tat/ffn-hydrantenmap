import CssBaseline from '@mui/material/CssBaseline';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import React from 'react';
import AppDrawer from '../components/site/AppDrawer';
import FirebaseUserProvider from '../components/firebase/FirebaseUserProvider';
import FirecallProvider from '../components/providers/FirecallProvider';
import HeaderBar from '../components/site/HeaderBar';
import SingedOutOneTapLogin from '../components/auth/SingedOutOneTapLogin';
import '../styles/globals.css';
import styles from '../styles/Home.module.css';

function MyApp({ Component, pageProps }: AppProps) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  return (
    <FirebaseUserProvider>
      <FirecallProvider>
        <div className={styles.container}>
          <Head>
            <title>Hydrantenkarte</title>
            <meta
              name="description"
              content="Hydrantenkarte der Freiwilligen Feuerwehr Neusiedl am See"
            />
            <link rel="icon" href="/favicon.ico" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
          </Head>
          <CssBaseline enableColorScheme />

          <AppDrawer isOpen={isDrawerOpen} setIsOpen={setIsDrawerOpen} />

          <HeaderBar
            isDrawerOpen={isDrawerOpen}
            setIsDrawerOpen={setIsDrawerOpen}
          />

          <SingedOutOneTapLogin />

          <Component {...pageProps} />
        </div>
      </FirecallProvider>
    </FirebaseUserProvider>
  );
}

export default MyApp;
