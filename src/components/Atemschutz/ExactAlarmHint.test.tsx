// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import deMessages from '../../../messages/de.json';
import { renderWithIntl } from '../../test-utils/intlRender';

const native = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    state: undefined as string | undefined,
    osState: 'denied' as string,
    listeners,
    set(next: string) {
      store.state = next;
      listeners.forEach((l) => l());
      return next;
    },
  };
  return {
    store,
    refresh: vi.fn(async () => store.set(store.osState)),
    request: vi.fn(async () => store.set('granted')),
  };
});

vi.mock('../../lib/nativeLocalNotifications', () => ({
  peekExactAlarmState: () => native.store.state,
  subscribeExactAlarmState: (l: () => void) => {
    native.store.listeners.add(l);
    return () => native.store.listeners.delete(l);
  },
  refreshExactAlarmState: native.refresh,
  requestExactAlarms: native.request,
}));

import ExactAlarmHint from './ExactAlarmHint';

const texts = deMessages.atemschutz.ueberwachung.exakteAlarme;

describe('ExactAlarmHint', () => {
  beforeEach(() => {
    native.store.state = undefined;
    native.store.osState = 'denied';
    native.store.listeners.clear();
    native.refresh.mockClear();
    native.request.mockClear();
  });

  it('bietet die Erlaubnis an, solange exakte Alarme fehlen', async () => {
    renderWithIntl(<ExactAlarmHint />);
    expect(await screen.findByText(texts.hinweis)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: texts.erlauben }));
    expect(native.request).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText(texts.hinweis)).not.toBeInTheDocument(),
    );
  });

  it.each(['granted', 'unavailable'])('zeigt bei „%s“ nichts', async (state) => {
    native.store.osState = state;
    renderWithIntl(<ExactAlarmHint />);
    await waitFor(() => expect(native.refresh).toHaveBeenCalled());
    expect(screen.queryByText(texts.hinweis)).not.toBeInTheDocument();
  });

  // Die Erlaubnis wird in den Systemeinstellungen erteilt; Android meldet das
  // der WebView nicht. Beim Zurückkehren in die App wird nachgelesen.
  it('liest beim Zurückkehren in die App nach', async () => {
    renderWithIntl(<ExactAlarmHint />);
    expect(await screen.findByText(texts.hinweis)).toBeInTheDocument();

    native.store.osState = 'granted';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() =>
      expect(screen.queryByText(texts.hinweis)).not.toBeInTheDocument(),
    );
  });
});
