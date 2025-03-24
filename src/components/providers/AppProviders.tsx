'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { SessionProvider } from 'next-auth/react';
import React from 'react';
import About from '../../app/about/page';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import '../../styles/globals.css';
import styles from '../../styles/Home.module.css';
import SingedOutOneTapLogin from '../auth/SingedOutOneTapLogin';
import ChatMessageDisplay from '../chat/chat-message';
import FirebaseUserProvider from '../firebase/FirebaseUserProvider';
import DynamicLogin from '../pages/LoginUi';
import AppDrawer from '../site/AppDrawer';
import HeaderBar from '../site/HeaderBar';
import FirecallLayerProvider from './FirecallLayerProvider';
import FirecallProvider from './FirecallProvider';
import dynamic from 'next/dynamic';
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
        <FirecallLayerProvider>
          <MapEditorProvider>
            <AppDrawer isOpen={isDrawerOpen} setIsOpen={setIsDrawerOpen} />

            <HeaderBar
              isDrawerOpen={isDrawerOpen}
              setIsDrawerOpen={setIsDrawerOpen}
            />
            <ChatMessageDisplay />
            {children}
          </MapEditorProvider>
        </FirecallLayerProvider>
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
  return (
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
  );
}
