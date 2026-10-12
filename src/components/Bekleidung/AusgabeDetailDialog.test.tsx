// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { setAusgabeBemerkung, reassignItems, returnItems } = vi.hoisted(() => ({
  setAusgabeBemerkung: vi.fn(),
  reassignItems: vi.fn(),
  returnItems: vi.fn(),
}));
vi.mock('./bekleidungActions', () => ({ setAusgabeBemerkung, reassignItems, returnItems }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import AusgabeDetailDialog from './AusgabeDetailDialog';

describe('AusgabeDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAusgabeBemerkung.mockResolvedValue({ success: true });
    reassignItems.mockResolvedValue({ success: true });
    returnItems.mockResolvedValue({ success: true });
  });

  it('ergänzt die Bemerkung einer Mengen-Ausgabe', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <AusgabeDetailDialog open view={sampleView()} ausgabeId="a2" onClose={vi.fn()} />,
    );
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bemerkung bearbeiten' }));
    await user.type(screen.getByRole('textbox', { name: 'Bemerkung' }), 'Sommer');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(setAusgabeBemerkung).toHaveBeenCalledWith('ffnd', 'a2', 'Sommer');
  });

  it('gibt einen Teil der Menge weiter', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <AusgabeDetailDialog open view={sampleView()} ausgabeId="a2" onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: 'Weitergeben' }));
    await user.click(screen.getByRole('combobox', { name: 'Neue Person' }));
    await user.click(screen.getByRole('option', { name: 'Erika Musterfrau' }));
    const menge = screen.getByRole('spinbutton', { name: 'Anzahl (höchstens 2)' });
    await user.clear(menge);
    await user.type(menge, '1');
    await user.click(screen.getByRole('button', { name: 'Weitergeben' }));
    expect(reassignItems).toHaveBeenCalledWith(
      'ffnd',
      expect.objectContaining({
        personId: 'p2',
        stueckIds: [],
        mengen: [{ ausgabeId: 'a2', menge: 1 }],
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('eine geschlossene Ausgabe bietet nur die Bemerkung', () => {
    renderWithIntl(
      <AusgabeDetailDialog open view={sampleView()} ausgabeId="a3" onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Weitergeben' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bemerkung bearbeiten' })).toBeInTheDocument();
  });
});
