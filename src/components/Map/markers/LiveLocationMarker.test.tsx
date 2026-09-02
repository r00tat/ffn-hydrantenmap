// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildIconHtml,
  formatRelative,
  markerDisplayName,
} from './LiveLocationMarker';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatRelative', () => {
  it('formats seconds when under one minute', () => {
    const now = 1_000_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(now - 30_000)).toBe('vor 30 s');
  });

  it('formats minutes when one minute or more', () => {
    const now = 1_000_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(now - 3 * 60 * 1000)).toBe('vor 3 min');
  });

  it('clamps negative ages to 0 seconds', () => {
    const now = 1_000_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    // future timestamp -> negative age
    expect(formatRelative(now + 5_000)).toBe('vor 0 s');
  });
});

describe('buildIconHtml', () => {
  it('contains initials, color, and display name', () => {
    const html = buildIconHtml({
      initials: 'AB',
      color: '#1976d2',
      displayName: 'Anna Bauer',
      opacity: 1,
    });
    expect(html).toContain('AB');
    expect(html).toContain('#1976d2');
    expect(html).toContain('Anna Bauer');
    expect(html).toContain('opacity:1');
  });

  it('reflects faded opacity in the wrapper style', () => {
    const html = buildIconHtml({
      initials: 'XY',
      color: '#000',
      displayName: 'X Y',
      opacity: 0.5,
    });
    expect(html).toContain('opacity:0.5');
  });
});

// Nachtrag zu #760: dasselbe Konto auf mehreren Geräten steht jetzt mehrfach
// auf der Karte, und die Marker müssen unterscheidbar sein.
describe('markerDisplayName', () => {
  it('is the plain name for a single device', () => {
    expect(
      markerDisplayName({
        name: 'Paul Wölfel',
        email: 'paul@x.at',
        deviceLabel: 'Android',
        showDeviceLabel: false,
      }),
    ).toBe('Paul Wölfel');
  });

  it('appends the device when the person appears more than once', () => {
    expect(
      markerDisplayName({
        name: 'Paul Wölfel',
        email: 'paul@x.at',
        deviceLabel: 'Android',
        showDeviceLabel: true,
      }),
    ).toBe('Paul Wölfel (Android)');
  });

  it('stays with the plain name when the device is unknown', () => {
    expect(
      markerDisplayName({
        name: 'Paul Wölfel',
        email: 'paul@x.at',
        showDeviceLabel: true,
      }),
    ).toBe('Paul Wölfel');
  });

  it('falls back to the email as the person name', () => {
    expect(
      markerDisplayName({ name: '', email: 'paul@x.at', showDeviceLabel: true }),
    ).toBe('paul@x.at');
  });
});

describe('LiveLocationMarker rendering decisions', () => {
  it('returns null when opacity is zero (stale)', async () => {
    const { default: LiveLocationMarker } = await import('./LiveLocationMarker');
    const { Timestamp } = await import('firebase/firestore');
    const { STALE_HARD_CUTOFF_MS } = await import('../../../common/liveLocation');
    const now = 1_000_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const stale = now - STALE_HARD_CUTOFF_MS - 1;
    const loc = {
      id: 'u1',
      uid: 'u1',
      name: 'User One',
      email: 'u1@example.com',
      lat: 0,
      lng: 0,
      updatedAt: Timestamp.fromMillis(stale),
      expiresAt: Timestamp.fromMillis(stale + 1_000_000),
      updatedAtMs: stale,
      showDeviceLabel: false,
    };

    // Render without a MapContainer; component should bail out and return null
    // before any react-leaflet primitives mount.
    const { render } = await import('@testing-library/react');
    const { container } = render(<LiveLocationMarker loc={loc} />);
    expect(container.firstChild).toBeNull();
  });
});
