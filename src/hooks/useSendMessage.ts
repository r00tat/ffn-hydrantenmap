import { useCallback } from 'react';

import useApiRequest from './useApiRequest';
import { useFirecallId } from './useFirecall';

export default function useSendMessage() {
  const firecallId = useFirecallId();
  const apiRequest = useApiRequest();

  return useCallback(
    async (message: string) => {
      if (firecallId) {
        const response = await apiRequest(`/chat`, {
          message,
          firecallId,
        });

        console.info(`sent message: ${JSON.stringify(response)}`);
      }
    },
    [apiRequest, firecallId]
  );
}
