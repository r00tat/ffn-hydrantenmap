// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { setStueckStatus, setStueckBemerkung, reassignItems, returnItems } = vi.hoisted(() => ({
  setStueckStatus: vi.fn(),
  setStueckBemerkung: vi.fn(),
  reassignItems: vi.fn(),
  returnItems: vi.fn(),
}));
vi.mock('./bekleidungActions', () => ({
  setStueckStatus,
  setStueckBemerkung,
  reassignItems,
  returnItems,
}));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import StueckDetailDialog from './StueckDetailDialog';

describe('StueckDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStueckStatus.mockResolvedValue({ success: true });
    setStueckBemerkung.mockResolvedValue({ success: true });
    reassignItems.mockResolvedValue({ success: true });
    returnItems.mockResolvedValue({ success: true });
  });

  it('ergänzt die Bemerkung direkt im Dialog', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <StueckDetailDialog
        open
        view={sampleView()}
        stueckId="s1"
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Bemerkung bearbeiten' }));
    await user.type(screen.getByRole('textbox', { name: 'Bemerkung' }), ' Naht offen ');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(setStueckBemerkung).toHaveBeenCalledWith('ffnd', 's1', 'Naht offen');
  });

  it('bietet Zurücknehmen und Weitergeben nur bei einem ausgegebenen Stück', () => {
    renderWithIntl(
      <StueckDetailDialog
        open
        view={sampleView()}
        stueckId="s1"
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Weitergeben' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurücknehmen' })).not.toBeInTheDocument();
  });

  it('gibt ein ausgegebenes Stück an eine andere Person weiter', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <StueckDetailDialog
        open
        view={sampleView()}
        stueckId="s2"
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Weitergeben' }));
    await user.click(screen.getByRole('combobox', { name: 'Neue Person' }));
    // die bisherige Person und inaktive stehen nicht zur Wahl
    expect(screen.queryByRole('option', { name: 'Max Mustermann' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Erika Mustermann' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Erika Musterfrau' }));
    await user.clear(screen.getByLabelText('Datum'));
    await user.type(screen.getByLabelText('Datum'), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Weitergeben' }));
    expect(reassignItems).toHaveBeenCalledWith('ffnd', {
      personId: 'p2',
      datum: '2026-10-01',
      bemerkung: undefined,
      stueckIds: ['s2'],
      mengen: [],
    });
  });

  it('nimmt ein ausgegebenes Stück direkt zurück', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <StueckDetailDialog
        open
        view={sampleView()}
        stueckId="s2"
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    expect(returnItems).toHaveBeenCalledWith(
      'ffnd',
      expect.objectContaining({ ziel: 'lager', stueckIds: ['s2'], mengen: [] }),
    );
  });

  it('zeigt Waschzähler mit Altbestand, Warnung und Verlauf', () => {
    renderWithIntl(
      <StueckDetailDialog
        open
        view={sampleView()}
        stueckId="s1"
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/9 Waschgänge \(davon 1 aus Altbestand\) von max\. 10/),
    ).toBeInTheDocument();
    expect(screen.getByText('Höchstzahl bald erreicht')).toBeInTheDocument();
    expect(screen.getByText(/Wäsche · Imprägnierung/)).toBeInTheDocument();
    expect(screen.getByText(/Ausgegeben an Max Mustermann/)).toBeInTheDocument();
    expect(screen.getByText(/zurück am/)).toBeInTheDocument();
  });

  it('scheidet ein Stück mit Datum aus', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <StueckDetailDialog
        open
        view={sampleView()}
        stueckId="s2"
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Ausscheiden' }));
    await user.clear(screen.getByLabelText('Datum'));
    await user.type(screen.getByLabelText('Datum'), '2026-09-30');
    await user.type(screen.getByRole('textbox', { name: 'Bemerkung' }), 'verbrannt');
    await user.click(screen.getByRole('button', { name: 'Bestätigen' }));
    expect(setStueckStatus).toHaveBeenCalledWith(
      'ffnd',
      's2',
      'ausgeschieden',
      '2026-09-30',
      'verbrannt',
    );
  });
});
