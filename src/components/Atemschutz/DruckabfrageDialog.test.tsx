// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

function render(zielMeldungFehlt = true, rueckzugGemeldet = false) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <DruckabfrageDialog
      open
      trupp={trupp}
      zielMeldungFehlt={zielMeldungFehlt}
      rueckzugGemeldet={rueckzugGemeldet}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

const ankunftHaken = () =>
  screen.getByRole('checkbox', { name: /am Einsatzziel angekommen/ });
const rueckzugHaken = () =>
  screen.getByRole('checkbox', { name: /Rückzug angetreten/ });

describe('DruckabfrageDialog', () => {
  it('hakt die Ankunft nicht vor, solange sie fehlt', () => {
    // Vorbelegt hätte jede gewöhnliche Zwischenabfrage als Ankunft gegolten,
    // und daraus rechnet sich der Rückmarschdruck.
    render(true);
    expect(ankunftHaken()).not.toBeChecked();
    expect(
      screen.getByText(/noch keine Ankunft am Einsatzziel erfasst/),
    ).toBeInTheDocument();
  });

  it('lässt den Haken gesetzt, wenn die Ankunft schon gemeldet ist', async () => {
    // Der Trupp *ist* am Einsatzziel — ihn bei jeder weiteren Abfrage als nicht
    // angekommen anzubieten, widerspricht der Lage. Gerechnet wird weiter mit
    // der ersten Meldung, die Vorbelegung ändert daran nichts.
    const onSave = render(false);
    expect(ankunftHaken()).toBeChecked();
    expect(screen.queryByText(/noch keine Ankunft/)).toBeNull();

    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '150',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ amZiel: true });
  });

  it('lässt auch den Rückzug gesetzt, wenn er schon gemeldet ist', () => {
    render(false, true);
    expect(rueckzugHaken()).toBeChecked();
  });

  it('hakt den Rückzug nicht vor, solange er nicht gemeldet ist', () => {
    // Er beendet die Warnungen — das darf nicht aus Versehen passieren.
    render(false);
    expect(rueckzugHaken()).not.toBeChecked();
  });

  it('nimmt die Ankunft auf, wenn sie angekreuzt wird', async () => {
    const onSave = render(true);
    await userEvent.click(ankunftHaken());
    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '250',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ druck: 250, amZiel: true });
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
    expect(onSave.mock.calls[0][0]).toMatchObject({ druck: 200, amZiel: false });
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

  it('lässt den Zeitpunkt ohne Änderung weg — Sekunden bleiben erhalten', async () => {
    // `datetime-local` kennt nur Minuten. Fehlt der Zeitpunkt, nimmt
    // `buildDruckabfrage` den Moment des Speicherns samt Sekunden — sonst wäre
    // der gemessene Verbrauch um bis zu eine Minute verschoben.
    const onSave = render();
    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '180',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('zeitpunkt');
  });

  it('schickt einen von Hand eingetippten Zeitpunkt mit', async () => {
    // Die Meldung kommt über Funk und wird eine Minute später erfasst.
    const onSave = render();
    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '180',
    );
    fireEvent.change(screen.getByLabelText(/Zeitpunkt der Meldung/), {
      target: { value: '2026-09-02T10:05' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].zeitpunkt).toBe(
      new Date('2026-09-02T10:05').toISOString(),
    );
  });
});
