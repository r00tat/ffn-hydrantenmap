import debounce from 'lodash.debounce';
import { useEffect, useMemo, useRef } from 'react';

const useDebounce = (callback: () => void, time = 500) => {
  const ref = useRef<() => void>();

  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  const debouncedCallback = useMemo(() => {
    const func = () => {
      ref.current?.();
    };

    return debounce(func, time);
  }, [time]);

  return debouncedCallback;
};

export default useDebounce;
