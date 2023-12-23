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
import useFirebaseLogin from '../hooks/useFirebaseLogin';

import dynamic from 'next/dynamic';
import About from './about';

const DynamicLogin = dynamic(
  () => {
    return import('../components/pages/LoginUi');
  },
  { ssr: false }
);

function LogedinApp({ Component, pageProps }: AppProps) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  return (
    <FirecallProvider>
      <AppDrawer isOpen={isDrawerOpen} setIsOpen={setIsDrawerOpen} />

      <HeaderBar
        isDrawerOpen={isDrawerOpen}
        setIsDrawerOpen={setIsDrawerOpen}
      />

      <Component {...pageProps} />
    </FirecallProvider>
  );
}

function AuthorizationApp({ Component, pageProps, router }: AppProps) {
  const { isSignedIn, isAuthorized, displayName, email } = useFirebaseLogin();
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  if (isAuthorized) {
    return (
      <LogedinApp Component={Component} pageProps={pageProps} router={router} />
    );
  }
  return (
    <>
      <HeaderBar
        isDrawerOpen={isDrawerOpen}
        setIsDrawerOpen={setIsDrawerOpen}
      />
      <DynamicLogin />;
      <About />
    </>
  );
}

function MyApp({ Component, pageProps, router }: AppProps) {
  return (
    <FirebaseUserProvider>
      <Head>
        <title>Hydrantenkarte</title>
        <meta
          name="description"
          content="Hydrantenkarte der Freiwilligen Feuerwehr Neusiedl am See"
        />
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={styles.container}>
        <CssBaseline enableColorScheme />
        <SingedOutOneTapLogin />

        <AuthorizationApp
          Component={Component}
          pageProps={pageProps}
          router={router}
        />
      </div>
    </FirebaseUserProvider>
  );
}

export default MyApp;
