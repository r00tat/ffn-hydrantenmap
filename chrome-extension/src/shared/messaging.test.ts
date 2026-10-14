import { describe, expect, it, vi } from 'vitest';
import { createMessageListener } from './messaging';

describe('createMessageListener', () => {
  it('keeps the channel open and answers with the handler result', async () => {
    const sendResponse = vi.fn();
    const listener = createMessageListener(async () => ({ vehicles: [] }));

    expect(listener({ type: 'X' }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ vehicles: [] }),
    );
  });

  it('answers with the error message when the handler rejects', async () => {
    const sendResponse = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = createMessageListener(async () => {
      throw new Error('Missing or insufficient permissions.');
    });

    listener({ type: 'GET_FIRECALL_VEHICLES' }, {}, sendResponse);

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Missing or insufficient permissions.',
      }),
    );
    warn.mockRestore();
  });
});
