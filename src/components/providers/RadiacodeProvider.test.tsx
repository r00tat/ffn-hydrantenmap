// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BleAdapter } from '../../hooks/radiacode/bleAdapter';
import { RadiacodeMeasurement } from '../../hooks/radiacode/types';
import { RadiacodeProvider, useRadiacode } from './RadiacodeProvider';

function nullAdapter(): BleAdapter {
  return {
    isSupported: () => true,
    requestDevice: vi.fn(async () => ({ id: 'dev', name: 'RC-103', serial: 'SN' })),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    onNotification: vi.fn(async () => () => {}),
    write: vi.fn(async () => {}),
  };
}

function Probe({
  onValue,
}: {
  onValue: (v: ReturnType<typeof useRadiacode>) => void;
}) {
  const ctx = useRadiacode();
  onValue(ctx);
  return <div data-testid="count">{ctx.history.length}</div>;
}

describe('RadiacodeProvider', () => {
  it('exposes status, device, history and connect/disconnect', () => {
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider adapter={nullAdapter()}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );
    const ctx = values.at(-1)!;
    expect(ctx.status).toBe('idle');
    expect(ctx.device).toBeNull();
    expect(ctx.measurement).toBeNull();
    expect(ctx.history).toEqual([]);
    expect(typeof ctx.connect).toBe('function');
    expect(typeof ctx.disconnect).toBe('function');
  });

  it('appends to history when measurement changes', async () => {
    const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
    const adapter = nullAdapter();
    render(
      <RadiacodeProvider adapter={adapter} feedMeasurement={(fn) => feeds.push(fn)}>
        <Probe onValue={() => {}} />
      </RadiacodeProvider>,
    );

    act(() => {
      feeds[0]({ cps: 1, dosisleistung: 0.1, timestamp: 1000 });
    });
    act(() => {
      feeds[0]({ cps: 1, dosisleistung: 0.2, timestamp: 2000 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
    });
  });

  it('throws when useRadiacode is used outside the provider', () => {
    const Consumer = () => {
      useRadiacode();
      return null;
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/RadiacodeProvider/);
    err.mockRestore();
  });
});
