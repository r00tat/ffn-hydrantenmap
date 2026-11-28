// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HotkeyProvider, {
  HOTKEY_STORAGE_KEY,
  resetHotkeyStoreForTests,
  useHotkey,
  useHotkeys,
} from './HotkeyProvider';

function Probe({
  onMarker,
  onBug,
}: {
  onMarker: () => void;
  onBug?: () => void;
}) {
  useHotkey('map.marker', onMarker);
  useHotkey('bugReport.open', onBug ?? (() => {}));
  const { setBinding } = useHotkeys();
  return (
    <>
      <input aria-label="field" />
      <button onClick={() => setBinding('map.marker', 'Shift+X')}>rebind</button>
    </>
  );
}

describe('HotkeyProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetHotkeyStoreForTests();
    document.body.replaceChildren();
  });

  it('runs the handler for the default binding', () => {
    const onMarker = vi.fn();
    render(
      <HotkeyProvider>
        <Probe onMarker={onMarker} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM' });
    expect(onMarker).toHaveBeenCalledTimes(1);
  });

  it('ignores plain keys typed into an input but not modifier shortcuts', () => {
    const onMarker = vi.fn();
    const onBug = vi.fn();
    render(
      <HotkeyProvider>
        <Probe onMarker={onMarker} onBug={onBug} />
      </HotkeyProvider>,
    );
    const input = screen.getByLabelText('field');
    fireEvent.keyDown(input, { key: 'm', code: 'KeyM' });
    expect(onMarker).not.toHaveBeenCalled();
    fireEvent.keyDown(input, {
      key: 'B',
      code: 'KeyB',
      altKey: true,
      shiftKey: true,
    });
    expect(onBug).toHaveBeenCalledTimes(1);
  });

  it('only lets dialog-safe shortcuts through while a modal is open', () => {
    const onMarker = vi.fn();
    const onBug = vi.fn();
    render(
      <HotkeyProvider>
        <Probe onMarker={onMarker} onBug={onBug} />
        <div className="MuiModal-root" />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM' });
    expect(onMarker).not.toHaveBeenCalled();
    fireEvent.keyDown(window, {
      key: 'B',
      code: 'KeyB',
      altKey: true,
      shiftKey: true,
    });
    expect(onBug).toHaveBeenCalledTimes(1);
  });

  it('stores a changed binding and uses it', () => {
    const onMarker = vi.fn();
    render(
      <HotkeyProvider>
        <Probe onMarker={onMarker} />
      </HotkeyProvider>,
    );
    act(() => {
      screen.getByText('rebind').click();
    });
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM' });
    expect(onMarker).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'X', code: 'KeyX', shiftKey: true });
    expect(onMarker).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(window.localStorage.getItem(HOTKEY_STORAGE_KEY) ?? '{}'),
    ).toMatchObject({ overrides: { 'map.marker': 'Shift+X' } });
  });
});
