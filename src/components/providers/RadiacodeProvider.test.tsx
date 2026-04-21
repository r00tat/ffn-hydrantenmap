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

  it('subtracts baseline from every snapshot when SPEC_RESET did not clear the buffer', async () => {
    // At the real device, SPEC_RESET doesn't actually reset the accumulated
    // spectrum — the first snapshot already shows hours of accumulated data.
    // Provider must read a baseline immediately after the reset attempt and
    // subtract it from every subsequent snapshot.
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

    // Baseline: device has already accumulated 7620 s and some counts.
    (latest()!.readSpectrum as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      durationSec: 7620,
      coefficients: [0, 1, 0],
      counts: [10, 20, 30, 40],
      timestamp: 0,
    } satisfies SpectrumSnapshot);

    await act(async () => {
      await values.at(-1)!.startSpectrumRecording();
    });

    // First polling snapshot, 2 s into the session.
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

    it('wechselt state auf recording wenn spectrumSession aktiv ist', async () => {
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
      await act(async () => {
        await values.at(-1)!.startSpectrumRecording();
      });
      spies.startForegroundService.mockClear();
      act(() => {
        feeds[0]({ cps: 5, dosisleistung: 0.1, timestamp: 2000 });
      });
      await waitFor(() => {
        expect(spies.updateForegroundService).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'recording' }),
        );
      });
      expect(spies.startForegroundService).not.toHaveBeenCalled();
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
});
