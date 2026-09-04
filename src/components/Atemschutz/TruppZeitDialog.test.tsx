// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import TruppZeitDialog from './TruppZeitDialog';

function render() {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <TruppZeitDialog open onClose={vi.fn()} onConfirm={onConfirm} />,
  );
  return onConfirm;
}

describe('TruppZeitDialog', () => {
  it('schreibt die Rückkehr mit Zeit und Druck', async () => {
    const onConfirm = render();
    fireEvent.change(screen.getByLabelText(/Druck bei Rückkehr/), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rückkehr' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      status: 'zurueck',
      druckRueckkehr: 90,
    });
  });

  it('fragt nicht mehr nach der Einheit — das tut die Zuteilung', () => {
    render();
    expect(screen.queryByLabelText(/Entsendet an/)).toBeNull();
    expect(screen.queryByLabelText(/Taktische Einheit/)).toBeNull();
  });
});
