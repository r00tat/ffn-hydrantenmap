// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { claimWidgetContainer } from './widgetGuard';

describe('claimWidgetContainer', () => {
  it('laesst den ersten Start durch', () => {
    expect(claimWidgetContainer(document.createElement('div'))).toBe(true);
  });

  it('sperrt den zweiten Start fuer dasselbe Element', () => {
    const el = document.createElement('div');
    expect(claimWidgetContainer(el)).toBe(true);
    // Der StrictMode-Doppellauf: er darf das laufende Einloesen nicht
    // abbrechen.
    expect(claimWidgetContainer(el)).toBe(false);
    expect(claimWidgetContainer(el)).toBe(false);
  });

  it('laesst ein neues Element wieder zu', () => {
    claimWidgetContainer(document.createElement('div'));
    // Nach echtem Aus- und Wiedereinhaengen baut React ein neues Element.
    expect(claimWidgetContainer(document.createElement('div'))).toBe(true);
  });
});
