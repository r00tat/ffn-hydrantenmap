// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { renderWithIntl } from '../../test-utils/intlRender';
import DruckabfrageDialog from './DruckabfrageDialog';

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  truppName: 'Trupp 1',
  feuerwehr: 'Neusiedl am See',
  mitglieder: ['Anna Beispiel'],
  status: 'imEinsatz',
  bereitSeit: '2026-09-02T10:00:00.000Z',
  abmarschZeit: '2026-09-02T10:00:00.000Z',
  druckAbmarsch: 300,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

function render(zielMeldungFehlt = true) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <DruckabfrageDialog
      open
      trupp={trupp}
      zielMeldungFehlt={zielMeldungFehlt}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

const zielHaken = () =>
  screen.getByRole('checkbox', { name: /Einsatzziel erreicht/ });

describe('DruckabfrageDialog', () => {
  it('hakt die Zielmeldung vor, solange sie fehlt', () => {
    render(true);
    expect(zielHaken()).toBeChecked();
  });

  it('hakt sie nicht vor, wenn das Ziel schon gemeldet wurde', () => {
    render(false);
    expect(zielHaken()).not.toBeChecked();
  });

  it('speichert erst mit einem Druck', async () => {
    const onSave = render();
    const speichern = screen.getByRole('button', { name: 'Speichern' });
    expect(speichern).toBeDisabled();

    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '200',
    );
    await waitFor(() => expect(speichern).toBeEnabled());
    await userEvent.click(speichern);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ druck: 200, amZiel: true });
  });

  it('lehnt einen unsinnig hohen Druck ab', async () => {
    render();
    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '900',
    );
    expect(
      await screen.findByText('Druck muss zwischen 0 und 400 bar liegen'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('schickt einen Zeitpunkt mit — die Meldung kommt über Funk', async () => {
    const onSave = render();
    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '180',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].zeitpunkt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    );
  });
});
