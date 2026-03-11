import {
  FirecallLayersContext,
  useFirecallLayersFromFirstore,
} from '../../hooks/useFirecallLayers';

export default function FirecallLayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const layersContextValue = useFirecallLayersFromFirstore();
  return (
    <FirecallLayersContext.Provider value={layersContextValue}>
      {children}
    </FirecallLayersContext.Provider>
  );
}
