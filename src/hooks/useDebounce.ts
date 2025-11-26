import debounce from 'lodash.debounce';
import { useEffect, useMemo } from 'react';

const useDebounce = (callback: () => void, time = 500) => {
  const debouncedCallback = useMemo(
    () => debounce(callback, time),
    [callback, time]
  );

  useEffect(() => {
    // cleanup
    return () => {
      debouncedCallback.cancel();
    };
  }, [debouncedCallback]);

  return debouncedCallback;
};

export default useDebounce;
