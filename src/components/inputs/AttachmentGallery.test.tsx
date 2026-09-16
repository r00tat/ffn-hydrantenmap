// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';

vi.mock('../firebase/firebase', () => ({ default: {} }));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn((_storage: unknown, url: string) => ({
    name: url.split('/').pop() as string,
  })),
  getMetadata: vi.fn(async (fileRef: { name: string }) => ({
    contentType: fileRef.name.endsWith('.pdf')
      ? 'application/pdf'
      : 'image/jpeg',
  })),
  getDownloadURL: vi.fn(
    async (fileRef: { name: string }) => `https://example.test/${fileRef.name}`
  ),
  getBlob: vi.fn(async () => new Blob()),
  deleteObject: vi.fn(async () => undefined),
}));

const { default: AttachmentGallery } = await import('./AttachmentGallery');

const BILD = 'gs://bucket/firecall/1/files/bild1.jpg';
const BILD2 = 'gs://bucket/firecall/1/files/bild2.jpg';
const PDF = 'gs://bucket/firecall/1/files/einsatzplan.pdf';

describe('AttachmentGallery', () => {
  it('zeigt Bilder als Vorschau und Dokumente mit Namen', async () => {
    render(<AttachmentGallery urls={[BILD, PDF]} />);

    const bild = await screen.findByAltText('bild1.jpg');
    expect(bild).toHaveAttribute('src', 'https://example.test/bild1.jpg');
    // Das PDF kann keine Vorschau zeigen — dort trägt die Kachel den Namen.
    expect(await screen.findByText('einsatzplan.pdf')).toBeInTheDocument();
  });

  it('öffnet das Bild per Klick in der Großansicht mit Download', async () => {
    const user = userEvent.setup();
    render(<AttachmentGallery urls={[BILD, PDF]} />);

    await user.click(await screen.findByAltText('bild1.jpg'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('bild1.jpg');
    expect(
      screen.getByRole('button', { name: 'Herunterladen' })
    ).toBeInTheDocument();
  });

  it('blättert in der Großansicht zum nächsten Bild', async () => {
    const user = userEvent.setup();
    render(<AttachmentGallery urls={[BILD, BILD2]} />);

    await user.click(await screen.findByAltText('bild1.jpg'));
    await user.click(screen.getByRole('button', { name: 'Nächstes Bild' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveTextContent('bild2.jpg'));
  });

  it('bietet Löschen nur im Bearbeiten-Modus', async () => {
    const { unmount } = render(<AttachmentGallery urls={[BILD, PDF]} />);
    await screen.findByAltText('bild1.jpg');
    expect(screen.queryAllByRole('button', { name: 'Anhang löschen' })).toHaveLength(
      0
    );
    unmount();

    render(<AttachmentGallery urls={[BILD, PDF]} edit onDelete={vi.fn()} />);
    await screen.findByAltText('bild1.jpg');
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Anhang löschen' })
      ).toHaveLength(2)
    );
  });

  it('bleibt ohne Anhänge weg', () => {
    const { container } = render(<AttachmentGallery urls={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
