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

  it('blendet die Ankunft aus, sobald sie gemeldet ist', async () => {
    // Die Ankunft ist ein **Ereignis** und kein Zustand: Sie gibt es genau
    // einmal. Vorbelegt schrieb jede weitere Abfrage erneut `amZiel`, und im
    // Verlauf stand dann an jeder Zeile „Ankunft".
    const onSave = render(false);
    expect(
      screen.queryByRole('checkbox', { name: /am Einsatzziel angekommen/ }),
    ).toBeNull();
    expect(screen.queryByText(/noch keine Ankunft/)).toBeNull();

    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '150',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].amZiel).toBe(false);
  });

  it('blendet den Rückzug aus, sobald er angetreten ist', async () => {
    // Aus demselben Grund: Ein zweites „Rückzug angetreten" gibt es nicht.
    const onSave = render(false, true);
    expect(
      screen.queryByRole('checkbox', { name: /Rückzug angetreten/ }),
    ).toBeNull();

    await userEvent.type(
      screen.getByRole('spinbutton', { name: /Geringster Druck/ }),
      '80',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].rueckzug).toBe(false);
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

const tagebuchHaken = () =>
  screen.getByRole('checkbox', { name: /Eintrag ins Einsatztagebuch/ });

describe('DruckabfrageDialog als Statusmeldung', () => {
  it('speichert eine Meldung ohne Druck, wenn eine Bemerkung dasteht', async () => {
    const onSave = render();
    fireEvent.change(screen.getByLabelText(/Bemerkung/), {
      target: { value: 'starke Verrauchung' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      bemerkung: 'starke Verrauchung',
    });
    expect(onSave.mock.calls[0][0].druck).toBeUndefined();
  });

  it('lässt das Tagebuch-Häkchen leer — Zwischenabfragen bleiben draußen', () => {
    render();
    expect(tagebuchHaken()).not.toBeChecked();
    expect(tagebuchHaken()).not.toBeDisabled();
  });

  it('setzt und sperrt das Häkchen, sobald die Ankunft neu gemeldet wird', async () => {
    // Ankunft und Rückzug sind Einsatzereignisse — der Eintrag entsteht
    // unabhängig vom Haken, und das soll man sehen.
    const onSave = render(true);
    fireEvent.click(ankunftHaken());
    expect(tagebuchHaken()).toBeChecked();
    expect(tagebuchHaken()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Geringster Druck/), {
      target: { value: '240' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].tagebuch).toBe(true);
  });

  it('sperrt das Häkchen nicht, wenn die Ankunft längst gemeldet ist', () => {
    // Dann ist die Abfrage eine gewöhnliche Zwischenmeldung.
    render(false);
    expect(tagebuchHaken()).not.toBeDisabled();
  });
});
