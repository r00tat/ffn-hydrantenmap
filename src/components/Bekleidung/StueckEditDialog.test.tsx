// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { createStuecke, updateStueck } = vi.hoisted(() => ({
  createStuecke: vi.fn(),
  updateStueck: vi.fn(),
}));
vi.mock('./bekleidungActions', () => ({ createStuecke, updateStueck }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import StueckEditDialog from './StueckEditDialog';

describe('StueckEditDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStuecke.mockResolvedValue({ ids: ['n1', 'n2', 'n3'] });
    updateStueck.mockResolvedValue({ success: true });
  });

  it('sperrt die Tag-Nummer bei Anzahl über 1 und legt mehrere Stücke an', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<StueckEditDialog open view={sampleView()} onClose={onClose} />);

    const tag = screen.getByRole('textbox', { name: 'Tag-Nummer' });
    await user.type(tag, '4711');
    await user.type(screen.getByRole('textbox', { name: /Größe/ }), 'XL');
    const anzahl = screen.getByRole('spinbutton', { name: 'Anzahl' });
    await user.clear(anzahl);
    await user.type(anzahl, '3');
    expect(screen.getByRole('textbox', { name: 'Tag-Nummer' })).toBeDisabled();
    expect(screen.getByText('Nur bei Anzahl 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(createStuecke).toHaveBeenCalledWith('ffnd', {
      artikelId: 'jacke',
      groesse: 'XL',
      charge: undefined,
      tagNummer: undefined,
      eigentum: 'feuerwehr',
      lagerort: undefined,
      bemerkung: undefined,
      anzahl: 3,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('meldet eine vergebene Tag-Nummer', async () => {
    updateStueck.mockResolvedValue({ success: false, error: 'tagExists:1002' });
    const view = sampleView();
    const user = userEvent.setup();
    renderWithIntl(
      <StueckEditDialog open view={view} stueck={view.stueckById.get('s1')} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('spinbutton', { name: 'Anzahl' })).not.toBeInTheDocument();
    const tag = screen.getByRole('textbox', { name: 'Tag-Nummer' });
    await user.clear(tag);
    await user.type(tag, '1002');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(updateStueck).toHaveBeenCalledWith('ffnd', 's1', expect.objectContaining({ tagNummer: '1002' }));
    expect(screen.getByText('Die Tag-Nummer 1002 ist schon vergeben.')).toBeInTheDocument();
  });
});
