// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import OfflinePage from './OfflinePage';

describe('OfflinePage', () => {
  it('erklärt, dass die Seite offline nicht vorgehalten ist', () => {
    renderWithIntl(<OfflinePage />);
    expect(screen.getByText('Offline – Seite nicht verfügbar')).toBeInTheDocument();
  });

  it('führt mit einer echten Navigation zur Karte', () => {
    // Ein Link mit voller Navigation statt Client-Routing: Der RSC-Abruf
    // scheitert offline ohnehin, die Navigation beantwortet der Service Worker
    // aus der App-Shell.
    renderWithIntl(<OfflinePage />);
    expect(screen.getByRole('link', { name: 'Zur Karte' })).toHaveAttribute('href', '/');
  });

  it('lädt die ursprüngliche Adresse neu', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    renderWithIntl(<OfflinePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(reload).toHaveBeenCalled();
  });
});
