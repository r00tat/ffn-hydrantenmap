// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import TruppDialog from './TruppDialog';

function render(props: Partial<React.ComponentProps<typeof TruppDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <TruppDialog
      open
      feuerwehren={['Neusiedl am See']}
      personSuggestions={['Anna Beispiel']}
      onClose={vi.fn()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

describe('TruppDialog', () => {
  it('fragt am Sammelplatz nicht nach der Einheit', () => {
    // Dort steht beim Erfassen noch nicht fest, wohin der Trupp geht — das
    // entscheidet sich beim Entsenden.
    render();
    expect(screen.queryByLabelText(/Taktische Einheit/)).toBeNull();
  });

  it('belegt die Einheit mit der eigenen vor', async () => {
    // Wer bei seinem Fahrzeug einen Trupp erfasst, erfasst ihn für dieses —
    // das Feld soll das schon zeigen und nicht erst beim Speichern zufallen.
    const { onSave } = render({
      einheitVorschlaege: ['RLFA-ND', 'TLFA'],
      einheitVorgabe: 'RLFA-ND',
    });
    expect(screen.getByLabelText(/Taktische Einheit/)).toHaveValue('RLFA-ND');

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'Neusiedl am See' },
    });
    // Das Chip-Feld trägt sein Label an mehreren Knoten — der erste ist das
    // Eingabefeld.
    const mitglieder = screen.getAllByLabelText(/Truppmitglieder/)[0];
    fireEvent.change(mitglieder, { target: { value: 'Anna Beispiel' } });
    fireEvent.keyDown(mitglieder, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].entsendetAn).toBe('RLFA-ND');
  });

  it('lässt die Einheit eines bestehenden Trupps stehen', () => {
    render({
      einheitVorschlaege: ['RLFA-ND'],
      einheitVorgabe: 'RLFA-ND',
      trupp: {
        truppKey: 'k1',
        laufendeNummer: 1,
        feuerwehr: 'Neusiedl am See',
        mitglieder: ['Anna Beispiel'],
        status: 'bereit',
        bereitSeit: '2026-09-02T10:00:00.000Z',
        entsendetAn: 'TLFA',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      },
    });
    expect(screen.getByLabelText(/Taktische Einheit/)).toHaveValue('TLFA');
  });
});
