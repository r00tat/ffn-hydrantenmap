// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
vi.mock('../firebase/firebase', () => ({
  default: {},
  firebaseApp: {},
  firestore: {},
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  getDownloadURL: vi.fn(async () => ''),
  getBlob: vi.fn(async () => new Blob()),
  listAll: vi.fn(async () => ({ items: [], prefixes: [] })),
  uploadBytesResumable: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

import { renderWithIntl as render } from '../../test-utils/intlRender';
import FirecallItemTypeSelect from './FirecallItemTypeSelect';

describe('FirecallItemTypeSelect', () => {
  it('renders the current type with its label', () => {
    render(<FirecallItemTypeSelect value="vehicle" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Element Typ')).toHaveTextContent('Fahrzeug');
  });

  it('shows thematic group headings when opened', async () => {
    const user = userEvent.setup();
    render(<FirecallItemTypeSelect value="marker" onChange={vi.fn()} />);
    await user.click(screen.getByLabelText('Element Typ'));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Einsatztaktik')).toBeInTheDocument();
    expect(within(listbox).getByText('Wasserversorgung')).toBeInTheDocument();
    expect(within(listbox).getByText('Zeichnen')).toBeInTheDocument();
    expect(within(listbox).getByText('Dokumentation')).toBeInTheDocument();
    expect(within(listbox).getByText('Organisation')).toBeInTheDocument();
  });

  it('renders an icon for every selectable option', async () => {
    const user = userEvent.setup();
    render(<FirecallItemTypeSelect value="marker" onChange={vi.fn()} />);
    await user.click(screen.getByLabelText('Element Typ'));

    // MUI's SelectInput clones every child without a `value` prop — the group
    // headings — with role="option" as well, so pick the real entries by the
    // data-value it puts on the actual MenuItems.
    const options = screen
      .getAllByRole('option')
      .filter((o) => o.hasAttribute('data-value'));
    expect(options.length).toBeGreaterThan(10);
    for (const option of options) {
      // every option carries either an <img> (leaflet icon) or an MUI svg icon
      const hasIcon =
        option.querySelector('img') !== null ||
        option.querySelector('svg') !== null;
      expect(hasIcon).toBe(true);
    }
  });

  it('does not select anything when a group heading is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FirecallItemTypeSelect value="marker" onChange={onChange} />);
    await user.click(screen.getByLabelText('Element Typ'));

    const heading = within(screen.getByRole('listbox')).getByText(
      'Einsatztaktik',
    );
    expect(heading).not.toHaveAttribute('data-value');
    await user.click(heading);

    expect(onChange).not.toHaveBeenCalled();
    // the dropdown stays open, so the user can still pick an entry
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('reports the selected type key to onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FirecallItemTypeSelect value="marker" onChange={onChange} />);
    await user.click(screen.getByLabelText('Element Typ'));
    await user.click(screen.getByRole('option', { name: /Fahrzeug/ }));

    expect(onChange).toHaveBeenCalledWith('vehicle');
  });
});
