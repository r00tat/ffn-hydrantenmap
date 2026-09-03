// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import TruppZuteilungDialog from './TruppZuteilungDialog';

function render() {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <TruppZuteilungDialog
      open
      entsendetAnVorschlaege={['LFA', 'RLFA-ND']}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('TruppZuteilungDialog', () => {
  it('fragt weder Einsatzziel noch Auftrag — die gibt die Einheit', () => {
    render();
    expect(screen.queryByLabelText(/Einsatzziel/)).toBeNull();
    expect(screen.queryByLabelText(/^Auftrag/)).toBeNull();
  });

  it('setzt zugeteilt mit Übergabezeit und Druck, nie den Abmarsch', async () => {
    const onConfirm = render();
    fireEvent.change(screen.getByLabelText(/Entsendet an/), {
      target: { value: 'LFA' },
    });
    fireEvent.change(screen.getByLabelText(/Druck bei der Übergabe/), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entsenden' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const patch = onConfirm.mock.calls[0][0];
    expect(patch.status).toBe('zugeteilt');
    expect(patch.entsendetAn).toBe('LFA');
    expect(patch.druckUebergabe).toBe(300);
    expect(patch.uebergabeZeit).toEqual(expect.any(String));
    expect('abmarschZeit' in patch).toBe(false);
  });
});
