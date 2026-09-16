// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import DownloadAllButton from './DownloadAllButton';

vi.mock('./storageFile', () => ({
  downloadStorageFile: vi.fn(),
}));

describe('DownloadAllButton', () => {
  it('benennt sich selbst und nennt die Anzahl der Dateien', () => {
    render(<DownloadAllButton urls={['gs://a.jpg', 'gs://b.jpg']} />);

    // Beschriftet statt bloßem Icon: Neben einer Liste von Anhängen mit
    // eigenem Download-Icon sah der Knopf bisher aus wie ein Anhang mehr.
    expect(
      screen.getByRole('button', { name: /Alle herunterladen/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('bleibt ohne Dateien weg', () => {
    const { container } = render(<DownloadAllButton urls={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
