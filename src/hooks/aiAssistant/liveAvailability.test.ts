import { describe, expect, it } from 'vitest';
import {
  createLiveAvailability,
  LIVE_RETRY_AFTER_MS,
  LiveRejectedError,
  LiveUnavailableError,
  classifyLiveFailure,
} from './liveAvailability';

describe('classifyLiveFailure', () => {
  it('hält eine Umgebung ohne Live-Key für dauerhaft', () => {
    expect(classifyLiveFailure(new LiveUnavailableError('unconfigured'))).toBe('permanent');
  });

  it('hält das ausgeschöpfte Tageskontingent für dauerhaft', () => {
    expect(classifyLiveFailure(new LiveUnavailableError('quota'))).toBe('permanent');
  });

  it('hält einen gescheiterten Verbindungsaufbau für vorübergehend', () => {
    expect(classifyLiveFailure(new Error('Live-Sitzung: Verbindung fehlgeschlagen'))).toBe(
      'transient',
    );
    expect(classifyLiveFailure(new LiveUnavailableError('failed', 'HTTP 503'))).toBe('transient');
  });

  it('hält ein aufgebrauchtes Guthaben der API für dauerhaft', () => {
    // So schließt die Live-API den Socket, wenn das Prepaid-Guthaben des
    // Projekts leer ist (beobachtet 2026-11-26 im Einsatz).
    const error = new LiveRejectedError(
      1011,
      'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.',
    );
    expect(classifyLiveFailure(error)).toBe('permanent');
  });

  it('hält ein erschöpftes Kontingent der API für dauerhaft', () => {
    expect(
      classifyLiveFailure(new LiveRejectedError(1011, 'RESOURCE_EXHAUSTED: Quota exceeded')),
    ).toBe('permanent');
  });

  it('hält eine sonstige Abweisung für vorübergehend', () => {
    expect(classifyLiveFailure(new LiveRejectedError(1011, 'Internal error'))).toBe('transient');
    expect(classifyLiveFailure(new LiveRejectedError(1006, ''))).toBe('transient');
  });
});

describe('createLiveAvailability', () => {
  it('versucht Live, solange nichts gescheitert ist', () => {
    const availability = createLiveAvailability(() => 0);
    expect(availability.canTry()).toBe(true);
  });

  it('versucht es nach einem vorübergehenden Fehler erst nach der Pause wieder', () => {
    let now = 1_000;
    const availability = createLiveAvailability(() => now);

    availability.recordFailure(new Error('Live-Sitzung: Verbindung fehlgeschlagen'));
    expect(availability.canTry()).toBe(false);

    now += LIVE_RETRY_AFTER_MS - 1;
    expect(availability.canTry()).toBe(false);

    now += 1;
    expect(availability.canTry()).toBe(true);
  });

  it('bleibt nach einem dauerhaften Fehler beim Einzelaufruf', () => {
    let now = 0;
    const availability = createLiveAvailability(() => now);

    availability.recordFailure(new LiveUnavailableError('unconfigured'));
    now += LIVE_RETRY_AFTER_MS * 100;
    expect(availability.canTry()).toBe(false);
  });

  it('vergisst den Fehler nach einem gelungenen Gespräch', () => {
    const now = 0;
    const availability = createLiveAvailability(() => now);

    availability.recordFailure(new Error('timeout'));
    availability.recordSuccess();
    expect(availability.canTry()).toBe(true);
  });
});
