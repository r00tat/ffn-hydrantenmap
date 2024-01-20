import {
  DebugLoggingContext,
  useFirebaseDebugging,
} from '../../hooks/useDebugging';
import DebugMessageDisplay from '../firebase/debug-messages';

export default function DebugLoggingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const debugLogging = useFirebaseDebugging();
  return (
    <DebugLoggingContext.Provider value={debugLogging}>
      <DebugMessageDisplay />
      {children}
    </DebugLoggingContext.Provider>
  );
}
