import CssBaseline from '@mui/material/CssBaseline';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import React from 'react';
import AppDrawer from '../components/AppDrawer';
import FirebaseUserProvider from '../components/FirebaseUserProvider';
import FirecallProvider from '../components/FirecallProvider';
import HeaderBar from '../components/HeaderBar';
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

          <Component {...pageProps} />
        </div>
      </FirecallProvider>
    </FirebaseUserProvider>
  );
}

export default MyApp;
