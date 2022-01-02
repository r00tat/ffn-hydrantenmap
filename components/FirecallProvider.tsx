import {
  defaultFirecall,
  FirecallContext,
  useFirecall,
} from '../hooks/useFirecall';

export default function FirecallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firecall = useFirecall();
  return (
    <>
      <FirecallContext.Provider value={firecall || defaultFirecall}>
        {children}
      </FirecallContext.Provider>
    </>
  );
}
