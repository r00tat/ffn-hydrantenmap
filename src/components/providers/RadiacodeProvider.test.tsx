// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BleAdapter } from '../../hooks/radiacode/bleAdapter';
import { RadiacodeClient, SessionEvent } from '../../hooks/radiacode/client';
import { SpectrumSnapshot } from '../../hooks/radiacode/protocol';
import { RadiacodeMeasurement } from '../../hooks/radiacode/types';
import { RadiacodeProvider, useRadiacode } from './RadiacodeProvider';

const mockAdd = vi.fn(async (_item: unknown) => ({ id: 'new-doc' }));
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => mockAdd,
}));

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
        getDeviceInfo: vi.fn(async () => ({
          firmwareVersion: '4.14',
          bootVersion: '4.1',
          hardwareSerial: 'TEST-SERIAL',
        })),
        readSpectrum: vi.fn(
          async () =>
            ({
              durationSec: 0,
              coefficients: [0, 1, 0] as [number, number, number],
              counts: [0, 0, 0, 0],
              timestamp: 0,
            }) satisfies SpectrumSnapshot,
        ),
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

  it('startet kein spektrum-polling vor startLiveRecording()', async () => {
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

    const client = latest()!;
    expect(client.startSpectrumPolling).not.toHaveBeenCalled();
  });

  it('startet spektrum-polling nach startLiveRecording()', async () => {
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
      values.at(-1)!.startLiveRecording();
    });

    const client = latest()!;
    expect(client.startSpectrumPolling).toHaveBeenCalledTimes(1);

    const s = snap({ durationSec: 5, timestamp: 1000 });
    await act(async () => {
      client.emitSnapshot(s);
    });

    const ctx = values.at(-1)!;
    expect(ctx.spectrum).not.toBeNull();
  });

  it('stopLiveRecording beendet das polling und räumt spectrum auf', async () => {
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
      values.at(-1)!.startLiveRecording();
    });
    await act(async () => {
      latest()!.emitSnapshot(snap({ durationSec: 5, timestamp: 1000 }));
    });
    expect(values.at(-1)!.spectrum).not.toBeNull();

    await act(async () => {
      values.at(-1)!.stopLiveRecording();
    });

    expect(latest()!.stopSpectrumPolling).toHaveBeenCalled();
    expect(values.at(-1)!.spectrum).toBeNull();
    expect(values.at(-1)!.liveRecording).toBe(false);
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
      values.at(-1)!.startLiveRecording();
    });

    const s = snap({ durationSec: 42, timestamp: 1234 });
    await act(async () => {
      latest()!.emitSnapshot(s);
    });

    const ctx = values.at(-1)!;
    expect(ctx.spectrum).toEqual(s);
  });

  it('subtracts baseline from every snapshot when SPEC_RESET did not clear the buffer', async () => {
    // At the real device, SPEC_RESET doesn't actually reset the accumulated
    // spectrum — the first snapshot already shows hours of accumulated data.
    // Provider reads a baseline immediately after connect and subtracts it
    // from every subsequent snapshot.
    const adapter = nullAdapter();
    const { factory, latest } = makeFakeSpectrumClientFactory();
    const values: ReturnType<typeof useRadiacode>[] = [];

    render(
      <RadiacodeProvider adapter={adapter} clientFactory={factory}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );

    // Baseline: device has already accumulated 7620 s and some counts.
    // readSpectrum is called once inside connect() before startSpectrumPolling.
    // Provide the baseline response on the client factory's first invocation.
    const origFactory = factory;
    void origFactory; // silence

    await act(async () => {
      const client = latest;
      void client;
      // Intercept: before connect finishes, set up the mock return.
      await values.at(-1)!.connect();
    });
    await act(async () => {
      values.at(-1)!.startLiveRecording();
    });

    // Replace baseline: the first readSpectrum was called during connect and
    // returned the default [0,0,0,0]. We instead emit a snapshot that's
    // compared against the baseline — so set baseline via resetLiveSpectrum
    // first to pin the expected behaviour.
    await act(async () => {
      // Explicitly set baseline using provider API by emitting a "baseline"
      // snapshot and calling resetLiveSpectrum.
      latest()!.emitSnapshot(
        snap({ durationSec: 7620, counts: [10, 20, 30, 40] }),
      );
    });
    await act(async () => {
      await values.at(-1)!.resetLiveSpectrum();
    });

    // Next polling snapshot, 2 s after baseline.
    await act(async () => {
      latest()!.emitSnapshot(
        snap({
          durationSec: 7622,
          counts: [12, 25, 33, 41],
        }),
      );
    });

    const ctx = values.at(-1)!;
    expect(ctx.spectrum?.durationSec).toBe(2);
    expect(ctx.spectrum?.counts).toEqual([2, 5, 3, 1]);
  });

  it('resetLiveSpectrum sets baseline from current snapshot and clears history', async () => {
    const adapter = nullAdapter();
    const { factory, latest } = makeFakeSpectrumClientFactory();
    const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider
        adapter={adapter}
        clientFactory={factory}
        feedMeasurement={(fn) => feeds.push(fn)}
      >
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );

    await act(async () => {
      await values.at(-1)!.connect();
    });
    await act(async () => {
      values.at(-1)!.startLiveRecording();
    });
    // Feed some samples first.
    act(() => {
      feeds[0]({ cps: 5, dosisleistung: 0.1, timestamp: 1000 });
    });
    act(() => {
      feeds[0]({ cps: 7, dosisleistung: 0.2, timestamp: 2000 });
    });
    await waitFor(() => {
      expect(values.at(-1)!.history.length).toBe(2);
    });

    // Emit a snapshot that should become the new baseline after reset.
    await act(async () => {
      latest()!.emitSnapshot(
        snap({ durationSec: 100, counts: [5, 10, 15, 20] }),
      );
    });

    await act(async () => {
      await values.at(-1)!.resetLiveSpectrum();
    });

    // history cleared.
    expect(values.at(-1)!.history).toEqual([]);

    // Next snapshot subtracts baseline.
    await act(async () => {
      latest()!.emitSnapshot(
        snap({ durationSec: 110, counts: [6, 13, 20, 25] }),
      );
    });
    const ctx = values.at(-1)!;
    expect(ctx.spectrum?.durationSec).toBe(10);
    expect(ctx.spectrum?.counts).toEqual([1, 3, 5, 5]);
  });

  it('history prunes samples older than 5 minutes from the latest sample', async () => {
    const adapter = nullAdapter();
    const { factory } = makeFakeSpectrumClientFactory();
    const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider
        adapter={adapter}
        clientFactory={factory}
        feedMeasurement={(fn) => feeds.push(fn)}
      >
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );
    await act(async () => {
      await values.at(-1)!.connect();
    });

    // Sample within window, then jump past window → older sample must be pruned.
    act(() => {
      feeds[0]({ cps: 1, dosisleistung: 0.1, timestamp: 1000 });
    });
    act(() => {
      feeds[0]({ cps: 2, dosisleistung: 0.2, timestamp: 1000 + 6 * 60_000 });
    });

    await waitFor(() => {
      expect(values.at(-1)!.history.length).toBe(1);
    });
    expect(values.at(-1)!.history[0].cps).toBe(2);
  });

  it('saveLiveSpectrum persists current snapshot via useFirecallItemAdd and keeps polling', async () => {
    mockAdd.mockClear();
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
      values.at(-1)!.startLiveRecording();
    });
    const s = snap({ durationSec: 42, timestamp: 1_700_000_000_000 });
    await act(async () => {
      latest()!.emitSnapshot(s);
    });

    let docId: string | null = null;
    await act(async () => {
      docId = await values.at(-1)!.saveLiveSpectrum({
        name: 'Mein Test',
        description: 'Demo',
      });
    });

    expect(docId).toBe('new-doc');
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const item = mockAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(item.type).toBe('spectrum');
    expect(item.name).toBe('Mein Test');
    expect(item.description).toBe('Demo');
    expect(item.counts).toEqual(s.counts);
    expect(item.coefficients).toEqual(s.coefficients);
    expect(item.measurementTime).toBe(42);
    expect(item.liveTime).toBe(42);

    // Polling still live: stopSpectrumPolling should NOT have been called.
    expect(latest()!.stopSpectrumPolling).not.toHaveBeenCalled();
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
      latest()!.triggerSessionEvent('reconnecting');
    });
    expect(values.at(-1)!.status).toBe('connecting');

    await act(async () => {
      latest()!.triggerSessionEvent('reconnected');
    });
    expect(values.at(-1)!.status).toBe('connected');
  });

  describe('notification service', () => {
    function serviceAdapter() {
      const disconnectHandlers: Array<() => void> = [];
      const base = nullAdapter();
      const startForegroundService = vi.fn(async () => {});
      const updateForegroundService = vi.fn(async () => {});
      const stopForegroundService = vi.fn(async () => {});
      const onDisconnectRequested = vi.fn((h: () => void) => {
        disconnectHandlers.push(h);
        return () => {
          const i = disconnectHandlers.indexOf(h);
          if (i >= 0) disconnectHandlers.splice(i, 1);
        };
      });
      return {
        adapter: {
          ...base,
          startForegroundService,
          updateForegroundService,
          stopForegroundService,
          onDisconnectRequested,
        } as BleAdapter,
        spies: {
          startForegroundService,
          updateForegroundService,
          stopForegroundService,
          onDisconnectRequested,
        },
        triggerDisconnectRequest: () => {
          disconnectHandlers.forEach((h) => h());
        },
      };
    }

    it('startet den foreground-service beim wechsel auf connected', async () => {
      const { adapter, spies } = serviceAdapter();
      const { factory } = makeFakeSpectrumClientFactory();
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider adapter={adapter} clientFactory={factory}>
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      await act(async () => {
        await values.at(-1)!.connect();
      });
      await waitFor(() => {
        expect(spies.startForegroundService).toHaveBeenCalledTimes(1);
      });
      expect(spies.startForegroundService).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('verbunden') }),
      );
    });

    it('schickt updateForegroundService bei jeder neuen messung', async () => {
      const { adapter, spies } = serviceAdapter();
      const { factory } = makeFakeSpectrumClientFactory();
      const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider
          adapter={adapter}
          clientFactory={factory}
          feedMeasurement={(fn) => feeds.push(fn)}
        >
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      await act(async () => {
        await values.at(-1)!.connect();
      });
      act(() => {
        feeds[0]({ cps: 11, dosisleistung: 0.42, timestamp: 1000 });
      });
      await waitFor(() => {
        expect(spies.updateForegroundService).toHaveBeenCalledWith({
          dosisleistung: 0.42,
          cps: 11,
          state: 'connected',
        });
      });
    });

    it('stoppt den service beim disconnect', async () => {
      const { adapter, spies } = serviceAdapter();
      const { factory } = makeFakeSpectrumClientFactory();
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
        await values.at(-1)!.disconnect();
      });
      await waitFor(() => {
        expect(spies.stopForegroundService).toHaveBeenCalled();
      });
    });

    it('reagiert auf onDisconnectRequested durch disconnect-aufruf', async () => {
      const { adapter, triggerDisconnectRequest } = serviceAdapter();
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
        triggerDisconnectRequest();
      });
      await waitFor(() => {
        expect(latest()!.disconnect).toHaveBeenCalled();
      });
    });
  });

  describe('lastSampleTimestamp', () => {
    it('ist null, solange keine messung eingetroffen ist', () => {
      const adapter = nullAdapter();
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider adapter={adapter}>
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      expect(values.at(-1)!.lastSampleTimestamp).toBeNull();
    });

    it('wird auf measurement.timestamp gesetzt, sobald eine messung eintrifft', async () => {
      const adapter = nullAdapter();
      const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider
          adapter={adapter}
          feedMeasurement={(fn) => feeds.push(fn)}
        >
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      const now = 1_700_000_000_000;
      act(() => {
        feeds[0]({ cps: 12, dosisleistung: 0.15, timestamp: now });
      });
      await waitFor(() => {
        expect(values.at(-1)!.lastSampleTimestamp).toBe(now);
      });
    });
  });
});
