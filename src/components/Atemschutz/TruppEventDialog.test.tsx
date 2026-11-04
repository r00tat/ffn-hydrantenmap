// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { fromLocalInput, toLocalInput } from '../../common/zeitEingabe';
import { renderWithIntl } from '../../test-utils/intlRender';
import TruppEventDialog from './TruppEventDialog';

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  truppName: 'Trupp 1',
  feuerwehr: 'Neusiedl am See',
  mitglieder: ['Anna Beispiel'],
  status: 'zurueck',
  bereitSeit: '2026-09-02T09:50:00.000Z',
  abmarschZeit: '2026-09-02T10:00:07.000Z',
  druckAbmarsch: 300,
  rueckkehrZeit: '2026-09-02T10:30:00.000Z',
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

function render(event: 'abmarsch' | 'rueckkehr') {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <TruppEventDialog open trupp={trupp} event={event} onClose={vi.fn()} onSave={onSave} />,
  );
  return onSave;
}

describe('TruppEventDialog', () => {
  it('belegt den Abmarsch vor und speichert den korrigierten Druck mit der genauen Zeit', async () => {
    const onSave = render('abmarsch');
    expect(screen.getByText('Abmarsch bearbeiten')).toBeInTheDocument();
    const druck = screen.getByLabelText(/Geringster Druck/);
    expect(druck).toHaveValue(300);
    fireEvent.change(druck, { target: { value: '290' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Unveränderte Zeit: die erfasste samt Sekunden, nicht auf :00 gekürzt.
    expect(onSave).toHaveBeenCalledWith({ zeitpunkt: trupp.abmarschZeit, druck: 290 });
  });

  it('speichert eine Rückkehr ohne Druck', async () => {
    const onSave = render('rueckkehr');
    expect(screen.getByLabelText(/Geringster Druck/)).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ zeitpunkt: trupp.rueckkehrZeit });
  });

  it('sperrt das Speichern bei einer Rückkehr vor dem Abmarsch', () => {
    render('rueckkehr');
    const zeit = toLocalInput(new Date('2026-09-02T09:55:00.000Z'));
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: zeit } });
    expect(fromLocalInput(zeit)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    expect(screen.getByText(/nach dem Abmarsch/)).toBeInTheDocument();
  });
});
