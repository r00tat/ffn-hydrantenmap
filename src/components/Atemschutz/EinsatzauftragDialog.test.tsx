// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { renderWithIntl } from '../../test-utils/intlRender';
import EinsatzauftragDialog from './EinsatzauftragDialog';

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  truppName: '1',
  feuerwehr: 'Neusiedl am See',
  mitglieder: ['Huber'],
  status: 'zugeteilt',
  bereitSeit: '2026-09-03T08:00:00.000Z',
  entsendetAn: 'LFA',
  uebergabeZeit: '2026-09-03T08:10:00.000Z',
  druckUebergabe: 300,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

function render() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <EinsatzauftragDialog
      open
      trupp={trupp}
      einheitVorschlaege={['LFA']}
      personSuggestions={['Maschinist LFA']}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('EinsatzauftragDialog', () => {
  it('belegt den Abmarschdruck aus der Übergabe vor', () => {
    // Zwischen Übergabe und Anschließen ändert sich der Flaschendruck nicht.
    render();
    expect(screen.getByLabelText(/Druck beim Abmarsch/)).toHaveValue(300);
  });

  it('gibt Auftrag, Ziel und Überwachung heraus', async () => {
    const onSave = render();
    fireEvent.change(screen.getByLabelText(/^Auftrag/), {
      target: { value: 'Menschenrettung' },
    });
    fireEvent.change(screen.getByLabelText(/Einsatzziel/), {
      target: { value: 'Keller Stiegenhaus links' },
    });
    fireEvent.change(screen.getByLabelText(/Überwachung durch/), {
      target: { value: 'Maschinist LFA' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'In den Einsatz schicken' }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      entsendetAn: 'LFA',
      auftrag: 'Menschenrettung',
      einsatzziel: 'Keller Stiegenhaus links',
      ueberwachtVon: 'Maschinist LFA',
      druckAbmarsch: 300,
    });
  });

  it('erklärt, dass danach die Zeitkontrolle läuft', () => {
    render();
    expect(screen.getByText(/Zeitkontrolle/)).toBeInTheDocument();
  });
});
