'use client';

import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import Typography from '@mui/material/Typography';
import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';
import React, { Suspense } from 'react';
import About from '../../app/about/page';
import useFirebaseAppCheck from '../../hooks/useFirebaseAppCheck';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import styles from '../../styles/Home.module.css';
import SingedOutOneTapLogin from '../auth/SingedOutOneTapLogin';
import ChatMessageDisplay from '../chat/chat-message';
import FirebaseUserProvider from '../firebase/FirebaseUserProvider';
import DynamicLogin from '../pages/LoginUi';
import AppDrawer from '../site/AppDrawer';
import HeaderBar from '../site/HeaderBar';
import FirecallLayerProvider from './FirecallLayerProvider';
import FirecallProvider from './FirecallProvider';
import MapEditorProvider from './MapEditorProvider';

const DebugLoggingProvider = dynamic(() => import('./DebugLoggingProvider'), {
  ssr: false,
});

interface AppProps {
  children: React.ReactNode;
}

function LogedinApp({ children }: AppProps) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  return (
    <FirecallProvider>
      <DebugLoggingProvider>
        <MapEditorProvider>
          <FirecallLayerProvider>
            <AppDrawer isOpen={isDrawerOpen} setIsOpen={setIsDrawerOpen} />

            <HeaderBar
              isDrawerOpen={isDrawerOpen}
              setIsDrawerOpen={setIsDrawerOpen}
            />
            <ChatMessageDisplay />
            {children}
          </FirecallLayerProvider>
        </MapEditorProvider>
      </DebugLoggingProvider>
    </FirecallProvider>
  );
}

function AuthorizationApp({ children }: AppProps) {
  const { isAuthorized } = useFirebaseLogin();
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  if (isAuthorized) {
    return <LogedinApp>{children}</LogedinApp>;
  }
  return (
    <>
      <HeaderBar
        isDrawerOpen={isDrawerOpen}
        setIsDrawerOpen={setIsDrawerOpen}
      />
      <DynamicLogin />
      <About />
    </>
  );
}

export default function AppProviders({ children }: AppProps) {
  useFirebaseAppCheck();

  return (
    <Suspense
      fallback={
        <Typography>
          Loading ... <CircularProgress />
        </Typography>
      }
    >
      <SessionProvider>
        <FirebaseUserProvider>
          <DebugLoggingProvider>
            <div className={styles.container}>
              <CssBaseline enableColorScheme />
              <SingedOutOneTapLogin />

              <AuthorizationApp>{children}</AuthorizationApp>
            </div>
          </DebugLoggingProvider>
        </FirebaseUserProvider>
      </SessionProvider>
    </Suspense>
  );
}
