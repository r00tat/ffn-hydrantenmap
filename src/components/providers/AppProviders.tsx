'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import Typography from '@mui/material/Typography';
import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import React, { Suspense } from 'react';
import About from '../../app/about/page';
import { isPublicRoute } from '../../common/publicRoutes';
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
import OfflineWarning from '../site/OfflineWarning';
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
const BugReportProvider = dynamic(
  () => import('../bugReport/BugReportProvider'),
  { ssr: false }
);
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
                <BugReportProvider>
                  <MapEditorProvider>
                    <FirecallLayerProvider>
                      <AppDrawer
                        isOpen={isDrawerOpen}
                        setIsOpen={setIsDrawerOpen}
                      />

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
                </BugReportProvider>
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
  const pathname = usePathname();

  // Öffentliche Routen (Fahrtenbuch-Share-Link) rendern ihren Inhalt ohne
  // Anmeldung — und ohne Drawer, HeaderBar und die Einsatz-Provider, die eine
  // Sitzung voraussetzen. Ohne diesen Zweig ersetzt der Login-Bildschirm unten
  // jeden Seiteninhalt, egal was die Route selbst tut.
  if (isPublicRoute(pathname)) {
    return <>{children}</>;
  }

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

/**
 * Der One-Tap-Prompt gehört nicht auf eine Seite, die bewusst ohne Anmeldung
 * bedient wird — er würde Gästen ein Google-Login-Overlay vor das Formular
 * legen.
 */
function OneTapLoginUnlessPublic() {
  const pathname = usePathname();
  if (isPublicRoute(pathname)) return null;
  return <SingedOutOneTapLogin />;
}

export default function AppProviders({ children }: AppProps) {
  useFirebaseAppCheck();
  useCapacitorAppExit();
  useGlobalErrorReporter();

  // Achtung beim Erweitern dieser Kette: Alles oberhalb von `AuthorizationApp`
  // läuft auch auf öffentlichen Routen wie `/fahrtenbuch/teilen/*`, die bewusst
  // ohne Anmeldung bedient werden. Ein Provider, der eine Sitzung voraussetzt
  // oder ungefragt UI einblendet, gehört unterhalb von `AuthorizationApp` (dort
  // steht der Bypass) oder muss sich selbst per `isPublicRoute` heraushalten —
  // Vorbild: `OneTapLoginUnlessPublic` weiter oben. Ein Fehler hier bricht die
  // Gastseite still: kein Test schlägt fehl, kein Linter warnt.
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
              <OfflineWarning />
              <DebugLoggingProvider>
                <div className={`${styles.container} print-content-root`}>
                  <CssBaseline enableColorScheme />
                  <OneTapLoginUnlessPublic />
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
