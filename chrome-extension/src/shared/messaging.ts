type Handler<M, R> = (message: M) => Promise<R>;

/**
 * Wraps an async message handler for `chrome.runtime.onMessage`.
 *
 * Returning `true` keeps the channel open for the async answer. If the handler
 * rejects (e.g. Firestore denies a read), it still has to answer: otherwise
 * Chrome closes the channel and the sender only sees "message channel closed
 * before a response was received" instead of the actual cause.
 */
export function createMessageListener<M, R>(handler: Handler<M, R>) {
  return (
    message: M,
    _sender: unknown,
    sendResponse: (response: R | { error: string }) => void,
  ): true => {
    handler(message).then(sendResponse, (err: unknown) => {
      console.warn('[EK] message handler failed:', message, err);
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  };
}
