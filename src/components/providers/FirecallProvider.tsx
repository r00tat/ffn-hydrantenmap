import { useMemo } from 'react';
import {
  FirecallContext,
  FirecallContextType,
  useLastOrSelectedFirecall,
} from '../../hooks/useFirecall';
import useCrewAssignments from '../../hooks/useCrewAssignments';

export default function FirecallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firecall = useLastOrSelectedFirecall();
  const firecallId = firecall.firecall?.id;
  const { crewAssignments, assignVehicle, updateFunktion } =
    useCrewAssignments(firecallId);

  const value: FirecallContextType = useMemo(
    () => ({
      ...firecall,
      crewAssignments,
      assignVehicle,
      updateFunktion,
    }),
    [firecall, crewAssignments, assignVehicle, updateFunktion]
  );

  return (
    <FirecallContext.Provider value={value}>
      {children}
    </FirecallContext.Provider>
  );
}
