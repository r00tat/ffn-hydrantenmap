// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { setStueckStatus } = vi.hoisted(() => ({ setStueckStatus: vi.fn() }));
vi.mock('./bekleidungActions', () => ({ setStueckStatus }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import StueckDetailDialog from './StueckDetailDialog';

describe('StueckDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStueckStatus.mockResolvedValue({ success: true });
  });

  it('zeigt Waschzähler mit Altbestand, Warnung und Verlauf', () => {
    renderWithIntl(
      <StueckDetailDialog open view={sampleView()} stueckId="s1" onClose={vi.fn()} onEdit={vi.fn()} />,
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
      <StueckDetailDialog open view={sampleView()} stueckId="s2" onClose={vi.fn()} onEdit={vi.fn()} />,
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
