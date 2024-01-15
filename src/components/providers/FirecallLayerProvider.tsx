import {
  FirecallLayersContext,
  useFirecallLayersFromFirstore,
} from '../../hooks/useFirecallLayers';

export default function FirecallLayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const layers = useFirecallLayersFromFirstore();
  return (
    <>
      <FirecallLayersContext.Provider value={layers}>
        {children}
      </FirecallLayersContext.Provider>
    </>
  );
}
