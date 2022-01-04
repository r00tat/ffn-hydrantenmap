import {
  defaultFirecall,
  FirecallContext,
  useLastFirecall,
} from '../hooks/useFirecall';

export default function FirecallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firecall = useLastFirecall();
  return (
    <>
      <FirecallContext.Provider value={firecall || defaultFirecall}>
        {children}
      </FirecallContext.Provider>
    </>
  );
}
