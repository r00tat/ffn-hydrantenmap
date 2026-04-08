import {
  FirecallContext,
  useLastOrSelectedFirecall,
} from '../../hooks/useFirecall';
import useCrewAssignments from '../../hooks/useCrewAssignments';

export default function FirecallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firecall = useLastOrSelectedFirecall();
  const { crewAssignments, assignVehicle, updateFunktion } =
    useCrewAssignments();

  return (
    <FirecallContext.Provider
      value={{
        ...firecall,
        crewAssignments,
        assignVehicle,
        updateFunktion,
      }}
    >
      {children}
    </FirecallContext.Provider>
  );
}
