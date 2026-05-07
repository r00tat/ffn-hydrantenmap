'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import Typography from '@mui/material/Typography';
import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';
import React, { Suspense } from 'react';
import About from '../../app/about/page';
import useFirebaseAppCheck from '../../hooks/useFirebaseAppCheck';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useGlobalErrorReporter from '../../hooks/useGlobalErrorReporter';
import useServerActionErrorDetection from '../../hooks/useServerActionErrorDetection';
import useServiceWorkerUpdate from '../../hooks/useServiceWorkerUpdate';
import { useCapacitorAppExit } from '../../hooks/useCapacitorAppExit';
import styles from '../../styles/Home.module.css';
import SingedOutOneTapLogin from '../auth/SingedOutOneTapLogin';
import ChatMessageDisplay from '../chat/chat-message';
import FirebaseUserProvider from '../firebase/FirebaseUserProvider';
import DynamicLogin from '../pages/LoginUi';
import AppDrawer from '../site/AppDrawer';
import HeaderBar from '../site/HeaderBar';
import ErrorBoundary from './ErrorBoundary';
import FirecallLayerProvider from './FirecallLayerProvider';
import FirecallProvider from './FirecallProvider';
import MapEditorProvider from './MapEditorProvider';
import SnackbarProvider from './SnackbarProvider';

const PositionProvider = dynamic(() => import('./PositionProvider'), {
  ssr: false,
});
const RadiacodeProvider = dynamic(() => import('./RadiacodeProvider'), {
  ssr: false,
});
const GpsProvider = dynamic(() => import('./GpsProvider'), {
  ssr: false,
});
const DebugLoggingProvider = dynamic(() => import('./DebugLoggingProvider'), {
  ssr: false,
});
const LiveLocationProvider = dynamic(() => import('./LiveLocationProvider'), {
  ssr: false,
});
const PermissionOnboardingProvider = dynamic(
  () => import('../permissions/PermissionOnboardingProvider'),
  { ssr: false }
);
const SettingsRedirectDialogProvider = dynamic(
  () => import('../permissions/SettingsRedirectDialogProvider'),
  { ssr: false }
);

interface AppProps {
  children: React.ReactNode;
}

function LogedinApp({ children }: AppProps) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  return (
    <FirecallProvider>
      <PositionProvider>
        <RadiacodeProvider>
          <GpsProvider>
            <LiveLocationProvider>
              <DebugLoggingProvider>
                <MapEditorProvider>
                  <FirecallLayerProvider>
                    <AppDrawer isOpen={isDrawerOpen} setIsOpen={setIsDrawerOpen} />

                    <HeaderBar
                      isDrawerOpen={isDrawerOpen}
                      setIsDrawerOpen={setIsDrawerOpen}
                    />
                    <ChatMessageDisplay />
                    <Box
                      className="print-content-root"
                      sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}
                    >
                      {children}
                    </Box>
                  </FirecallLayerProvider>
                </MapEditorProvider>
              </DebugLoggingProvider>
            </LiveLocationProvider>
          </GpsProvider>
        </RadiacodeProvider>
      </PositionProvider>
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

function ServiceWorkerUpdateListener() {
  useServiceWorkerUpdate();
  useServerActionErrorDetection();
  return null;
}

export default function AppProviders({ children }: AppProps) {
  useFirebaseAppCheck();
  useCapacitorAppExit();
  useGlobalErrorReporter();

  return (
    <Suspense
      fallback={
        <Typography>
          Loading ... <CircularProgress />
        </Typography>
      }
    >
      <ErrorBoundary>
        <SessionProvider>
          <FirebaseUserProvider>
            <SnackbarProvider>
              <ServiceWorkerUpdateListener />
              <DebugLoggingProvider>
                <div className={`${styles.container} print-content-root`}>
                  <CssBaseline enableColorScheme />
                  <SingedOutOneTapLogin />
                  <SettingsRedirectDialogProvider>
                    <PermissionOnboardingProvider>
                      <AuthorizationApp>{children}</AuthorizationApp>
                    </PermissionOnboardingProvider>
                  </SettingsRedirectDialogProvider>
                </div>
              </DebugLoggingProvider>
            </SnackbarProvider>
          </FirebaseUserProvider>
        </SessionProvider>
      </ErrorBoundary>
    </Suspense>
  );
}
