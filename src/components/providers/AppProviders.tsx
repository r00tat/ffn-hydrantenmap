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
import DebugLoggingProvider from './DebugLoggingProvider';
import FirecallLayerProvider from './FirecallLayerProvider';
import FirecallProvider from './FirecallProvider';

interface AppProps {
  children: React.ReactNode;
}

function LogedinApp({ children }: AppProps) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  return (
    <FirecallProvider>
      <DebugLoggingProvider>
        <FirecallLayerProvider>
          <AppDrawer isOpen={isDrawerOpen} setIsOpen={setIsDrawerOpen} />

          <HeaderBar
            isDrawerOpen={isDrawerOpen}
            setIsDrawerOpen={setIsDrawerOpen}
          />
          <ChatMessageDisplay />
          {children}
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
