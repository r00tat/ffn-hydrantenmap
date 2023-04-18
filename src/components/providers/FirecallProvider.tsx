import {
  FirecallContext,
  useLastOrSelectedFirecall,
} from '../../hooks/useFirecall';

export default function FirecallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firecall = useLastOrSelectedFirecall();
  return (
    <>
      <FirecallContext.Provider value={firecall}>
        {children}
      </FirecallContext.Provider>
    </>
  );
}
