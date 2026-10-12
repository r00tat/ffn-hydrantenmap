// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { recordWaesche } = vi.hoisted(() => ({ recordWaesche: vi.fn() }));
vi.mock('./bekleidungActions', () => ({ recordWaesche }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('../../hooks/useBarcodeScanner', () => ({
  default: () => ({ videoRef: { current: null }, status: 'unsupported', frames: 0 }),
}));

import WaescheDialog from './WaescheDialog';

async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByRole('button', { name: 'Scannen' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }),
    `${code}{Enter}`,
  );
}

describe('WaescheDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordWaesche.mockResolvedValue({ id: 'w9' });
  });

  it('verlangt bei „Sonstiges" eine Beschreibung', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<WaescheDialog open view={sampleView()} onClose={onClose} />);
    await scan(user, '1001');
    // s1 hat 8 + 1 Altbestand von max. 10: nach dieser Wäsche erreicht.
    expect(screen.getByText(/Höchstzahl erreicht · nach dieser Wäsche 10\/10/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Programm' }));
    await user.click(screen.getByRole('option', { name: 'Sonstiges' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(recordWaesche).not.toHaveBeenCalled();
    expect(screen.getByText('Bitte das Programm beschreiben.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Programm \(Beschreibung\)/ }), 'Kochwäsche');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(recordWaesche).toHaveBeenCalledWith('ffnd', {
      datum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      programm: 'sonstiges',
      programmText: 'Kochwäsche',
      stueckIds: ['s1'],
      bemerkung: undefined,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
