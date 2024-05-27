import { useCallback, useEffect, useState } from 'react';
import { HazmatMaterial } from '../common/hazmat';
import useFirebaseLogin from './useFirebaseLogin';
import useDebounce from './useDebounce';

export default function useHazmatDb(
  unNumber?: string,
  name?: string
): [HazmatMaterial[], boolean] {
  const [hazmatRecords, setHazmatRecords] = useState<HazmatMaterial[]>([]);
  const { user, isSignedIn } = useFirebaseLogin();
  const [isInProgress, setIsInProgress] = useState(false);

  const fetchHazmat = useCallback(
    async (unNumberArg?: string, unName?: string) => {
      console.info(`searching for hazmat ${unNumberArg} ${unName}`);
      if (!(isSignedIn && user && (unNumberArg || unName))) return;
      setIsInProgress(true);
      const token = await user?.getIdToken();
      const response: HazmatMaterial[] = await (
        await fetch(
          '/api/hazmat?' +
            new URLSearchParams({
              unnumber: '' + unNumberArg,
              name: '' + unName,
            }),
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
      ).json();
      setHazmatRecords(response);
      setIsInProgress(false);
    },
    [isSignedIn, user]
  );

  const fetchDb = useCallback(() => {
    fetchHazmat(unNumber, name);
  }, [fetchHazmat, name, unNumber]);

  const debouncedFetch = useDebounce(fetchDb);

  useEffect(() => {
    debouncedFetch();
  }, [debouncedFetch, unNumber, name]);

  return [hazmatRecords, isInProgress];
}
