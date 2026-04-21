// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BleAdapter } from '../../hooks/radiacode/bleAdapter';
import { RadiacodeClient, SessionEvent } from '../../hooks/radiacode/client';
import { SpectrumSnapshot } from '../../hooks/radiacode/protocol';
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

interface FakeSpectrumClient extends RadiacodeClient {
  emitSnapshot: (s: SpectrumSnapshot) => void;
  triggerSessionEvent: (e: SessionEvent) => void;
}

function makeFakeSpectrumClientFactory(): {
  factory: (adapter: BleAdapter, deviceId: string) => RadiacodeClient;
  latest: () => FakeSpectrumClient | null;
} {
  let last: FakeSpectrumClient | null = null;
  return {
    factory: () => {
      let snapshotCb: ((s: SpectrumSnapshot) => void) | null = null;
      let sessionCb: ((e: SessionEvent) => void) | null = null;
      const client = {
        connect: vi.fn(async () => {}),
        startPolling: vi.fn(),
        disconnect: vi.fn(async () => {}),
        specReset: vi.fn(async () => {}),
        startSpectrumPolling: vi.fn(
          (cb: (s: SpectrumSnapshot) => void) => {
            snapshotCb = cb;
          },
        ),
        stopSpectrumPolling: vi.fn(),
        onSessionEvent: vi.fn((handler: (e: SessionEvent) => void) => {
          sessionCb = handler;
          return () => {
            sessionCb = null;
          };
        }),
        emitSnapshot: (s: SpectrumSnapshot) => snapshotCb?.(s),
        triggerSessionEvent: (e: SessionEvent) => sessionCb?.(e),
      } as unknown as FakeSpectrumClient;
      last = client;
      return client;
    },
    latest: () => last,
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

function snap(override: Partial<SpectrumSnapshot> = {}): SpectrumSnapshot {
  return {
    durationSec: 10,
    coefficients: [0, 1, 0],
    counts: [1, 2, 3, 4],
    timestamp: Date.now(),
    ...override,
  };
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

  it('startSpectrumRecording calls specReset and begins polling', async () => {
    const adapter = nullAdapter();
    const { factory, latest } = makeFakeSpectrumClientFactory();
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider adapter={adapter} clientFactory={factory}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );

    await act(async () => {
      await values.at(-1)!.connect();
    });

    await act(async () => {
      await values.at(-1)!.startSpectrumRecording();
    });

    const client = latest()!;
    expect(client.specReset).toHaveBeenCalledTimes(1);
    expect(client.startSpectrumPolling).toHaveBeenCalledTimes(1);
    expect(values.at(-1)!.spectrumSession.active).toBe(true);
    expect(values.at(-1)!.spectrumSession.startedAt).not.toBeNull();
    expect(values.at(-1)!.spectrumSession.snapshotCount).toBe(0);
  });

  it('spectrum snapshots update the context value', async () => {
    const adapter = nullAdapter();
    const { factory, latest } = makeFakeSpectrumClientFactory();
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider adapter={adapter} clientFactory={factory}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );

    await act(async () => {
      await values.at(-1)!.connect();
    });
    await act(async () => {
      await values.at(-1)!.startSpectrumRecording();
    });

    const s = snap({ durationSec: 42, timestamp: 1234 });
    await act(async () => {
      latest()!.emitSnapshot(s);
    });

    const ctx = values.at(-1)!;
    expect(ctx.spectrum).toEqual(s);
    expect(ctx.spectrumSession.snapshotCount).toBe(1);
  });

  it('stopSpectrumRecording returns the last received snapshot', async () => {
    const adapter = nullAdapter();
    const { factory, latest } = makeFakeSpectrumClientFactory();
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider adapter={adapter} clientFactory={factory}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );

    await act(async () => {
      await values.at(-1)!.connect();
    });
    await act(async () => {
      await values.at(-1)!.startSpectrumRecording();
    });

    const s = snap({ durationSec: 99 });
    await act(async () => {
      latest()!.emitSnapshot(s);
    });

    let returned: SpectrumSnapshot | null = null;
    await act(async () => {
      returned = await values.at(-1)!.stopSpectrumRecording();
    });

    expect(returned).toEqual(s);
    expect(latest()!.stopSpectrumPolling).toHaveBeenCalled();
    expect(values.at(-1)!.spectrumSession.active).toBe(false);
  });

  it('cancelSpectrumRecording drops the snapshot without save', async () => {
    const adapter = nullAdapter();
    const { factory, latest } = makeFakeSpectrumClientFactory();
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider adapter={adapter} clientFactory={factory}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );

    await act(async () => {
      await values.at(-1)!.connect();
    });
    await act(async () => {
      await values.at(-1)!.startSpectrumRecording();
    });

    await act(async () => {
      latest()!.emitSnapshot(snap());
    });

    await act(async () => {
      await values.at(-1)!.cancelSpectrumRecording();
    });

    const ctx = values.at(-1)!;
    expect(ctx.spectrum).toBeNull();
    expect(ctx.spectrumSession.active).toBe(false);
    expect(ctx.spectrumSession.startedAt).toBeNull();
    expect(ctx.spectrumSession.snapshotCount).toBe(0);
    expect(latest()!.stopSpectrumPolling).toHaveBeenCalled();
  });

  it('emits reconnecting status on session event', async () => {
    const adapter = nullAdapter();
    const { factory, latest } = makeFakeSpectrumClientFactory();
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider adapter={adapter} clientFactory={factory}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );

    await act(async () => {
      await values.at(-1)!.connect();
    });
    await act(async () => {
      await values.at(-1)!.startSpectrumRecording();
    });

    await act(async () => {
      latest()!.triggerSessionEvent('reconnecting');
    });
    expect(values.at(-1)!.status).toBe('connecting');

    await act(async () => {
      latest()!.triggerSessionEvent('reconnected');
    });
    expect(values.at(-1)!.status).toBe('connected');
  });
});
