// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { ShareLinkFormData } from '../../common/fahrtenbuchShare';

const { createMock, refreshMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('./fahrtenbuchActions', () => ({
  createFahrtenbuchEntryViaShareLink: createMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import ShareLinkEntryForm from './ShareLinkEntryForm';

const data: ShareLinkFormData = {
  groupName: 'FF Neusiedl am See',
  vehicles: [
    {
      id: 'v1',
      name: 'TLF',
      counters: [
        {
          id: 'km',
          label: 'Kilometerstand',
          labelKey: 'counters.km',
          unit: 'km',
          mode: 'startEnd',
          changeWarning: 'decrease',
          required: true,
        },
      ],
      fuelTypes: ['diesel'],
      lastCounters: { km: 1200 },
    },
  ],
  persons: [{ id: 'p1', name: 'Max Mustermann' }],
  firecalls: [
    {
      id: 'f1',
      name: 'Brand B2',
      date: '2026-08-03T10:00:00.000Z',
      abruecken: '2026-08-03T12:00:00.000Z',
    },
  ],
};

/**
 * Eine Gruppe ohne Einsätze. Dann belegt das Formular keinen vor, und die
 * Fahrtstrecke ist das Feld, das die Fahrt benennt.
 */
const dataWithoutFirecalls: ShareLinkFormData = { ...data, firecalls: [] };

/**
 * Füllt ein Feld in einem Rutsch, statt Zeichen für Zeichen zu tippen. Das
 * Fahrer-Feld ist ein Autocomplete, das bei jedem Anschlag neu filtert und
 * rendert — zeichenweise getippt braucht das Ausfüllen des Formulars auf
 * langsamen CI-Runnern mehr als das 5s-Testtimeout, ohne dass die zusätzlichen
 * Anschläge etwas absichern.
 */
async function pasteInto(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  text: string,
) {
  await user.click(element);
  await user.paste(text);
}

describe('ShareLinkEntryForm', () => {
  beforeEach(() => {
    createMock.mockReset();
    refreshMock.mockReset();
    createMock.mockResolvedValue({ success: true, id: 'e1' });
    // jsdom kennt scrollIntoView nicht — das Formular ruft es bei einer
    // Ablehnung auf, damit die Meldung oben im Sichtbereich landet.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('zeigt den Gruppennamen und den Hinweis auf die eingeschränkte Sicht', () => {
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);
    expect(screen.getByText('FF Neusiedl am See')).toBeInTheDocument();
    expect(screen.getByText(/nicht einsehbar/i)).toBeInTheDocument();
  });

  /** Zwei Fahrzeuge — damit greift die Vorauswahl des Einzelfahrzeugs nicht. */
  const twoVehicles: ShareLinkFormData = {
    ...data,
    vehicles: [
      ...data.vehicles,
      { ...data.vehicles[0], id: 'v2', name: 'MTF', lastCounters: { km: 90 } },
    ],
  };

  it('zeigt ohne gewähltes Fahrzeug nur die Fahrzeugauswahl', () => {
    renderWithIntl(<ShareLinkEntryForm token="tok" data={twoVehicles} />);

    expect(screen.getByLabelText('Fahrzeug')).toBeInTheDocument();
    expect(
      screen.getByText(/zuerst ein Fahrzeug/i),
    ).toBeInTheDocument();
    // Die übrigen Felder hängen am Fahrzeug — ohne Auswahl stünde ein
    // Formular da, dem der Kilometerstand fehlt.
    expect(screen.queryByLabelText('Fahrer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fahrtzweck')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fahrstrecke \/ Ziel/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Abfahrt')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hinweise')).not.toBeInTheDocument();
  });

  it('zeigt die übrigen Felder, sobald ein Fahrzeug gewählt ist', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={twoVehicles} />);

    await user.click(screen.getByLabelText('Fahrzeug'));
    await user.click(await screen.findByRole('option', { name: 'MTF' }));

    expect(await screen.findByLabelText('Fahrer')).toBeInTheDocument();
    expect(screen.getByLabelText('Kilometerstand — Start')).toHaveValue(90);
    expect(screen.queryByText(/zuerst ein Fahrzeug/i)).not.toBeInTheDocument();
  });

  it('zeigt das Mangelfeld erst, wenn ein Defekt angehakt ist', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    expect(screen.queryByLabelText(/Mangelbeschreibung/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Defekt oder Mangel'));

    expect(
      await screen.findByLabelText(/Mangelbeschreibung/),
    ).toBeInTheDocument();
  });

  it('speichert den Mangel getrennt von den Hinweisen', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await pasteInto(user, screen.getByLabelText('Hinweise'), 'Tank halb voll');
    await user.click(screen.getByLabelText('Defekt oder Mangel'));
    await pasteInto(
      user,
      await screen.findByLabelText(/Mangelbeschreibung/),
      'Bremse zieht nach links',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1]).toMatchObject({
      hinweise: 'Tank halb voll',
      defekt: true,
      mangel: 'Bremse zieht nach links',
    });
  });

  it('lehnt einen gemeldeten Defekt ohne Beschreibung ab', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByLabelText('Defekt oder Mangel'));
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    expect(
      await screen.findByText('Bitte den Mangel beschreiben.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('verlangt eine Angabe zur Fahrstrecke', async () => {
    // Ohne verknüpften Einsatz ist das Feld die einzige Auskunft darüber, wohin
    // die Fahrt ging.
    const user = userEvent.setup();
    renderWithIntl(
      <ShareLinkEntryForm token="tok" data={dataWithoutFirecalls} />,
    );

    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    expect(
      await screen.findByText('Bitte Fahrstrecke oder Ziel angeben.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('belegt den neuesten Einsatz der Gruppe vor', async () => {
    // Wer den QR-Code am Fahrzeug nutzt, trägt fast immer die Fahrt zum
    // laufenden Einsatz ein. Einen „aktiven" Einsatz gibt es hier nicht — die
    // App-Auswahl braucht eine Anmeldung.
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await waitFor(() =>
      expect(screen.getByLabelText('Einsatz')).toHaveValue('Brand B2'),
    );
    expect(screen.getByLabelText('Fahrtzweck')).toHaveTextContent('Einsatz');
    // Der Einsatz benennt die Fahrt, das Feld dafür entfällt.
    expect(
      screen.queryByLabelText(/Fahrstrecke \/ Ziel/),
    ).not.toBeInTheDocument();
  });

  it('schickt den gewählten Einsatz mit', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({ success: true, id: 'e1' });
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][1]).toMatchObject({
      zweck: 'einsatz',
      firecallId: 'f1',
    });
  });

  it('belegt ohne Einsätze der Gruppe nichts vor', async () => {
    renderWithIntl(
      <ShareLinkEntryForm token="tok" data={dataWithoutFirecalls} />,
    );

    // Ohne Einsätze bleibt der Zweck auf „Sonstiges" und die Fahrtstrecke ist
    // das Feld, das die Fahrt benennt.
    expect(screen.getByLabelText('Fahrtzweck')).toHaveTextContent('Sonstiges');
    expect(screen.getByLabelText(/Fahrstrecke \/ Ziel/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Einsatz')).not.toBeInTheDocument();
  });

  it('nimmt getippten Text als Fahrtstrecke, wenn kein Einsatz passt', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({ success: true, id: 'e1' });
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    const einsatz = await screen.findByLabelText('Einsatz');
    await user.clear(einsatz);
    await pasteInto(user, einsatz, 'Ölspur Umfahrung');
    await user.tab();

    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][1]).toMatchObject({
      firecallId: undefined,
      ziel: 'Ölspur Umfahrung',
    });
  });

  it('bestätigt ein vom Server gemeldetes Duplikat', async () => {
    // Der Gast sieht die Fahrten der Gruppe nicht; die Antwort der Action ist
    // seine einzige Warnung — und muss trotzdem einen Weg nach vorne lassen.
    const user = userEvent.setup();
    createMock.mockResolvedValueOnce({
      success: false,
      error: 'duplicateFirecallEntry',
    });
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    expect(
      await screen.findByText(
        'Für dieses Fahrzeug ist die Fahrt zu diesem Einsatz schon erfasst',
      ),
    ).toBeInTheDocument();

    createMock.mockResolvedValueOnce({ success: true, id: 'e1' });
    await user.click(
      screen.getByRole('checkbox', {
        name: /trotzdem eine zweite Ausfahrt/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock.mock.calls[1][2]).toEqual({ confirmDuplicate: true });
  });

  it('belegt den Startzähler aus dem Fahrzeug-Cache vor', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await user.click(screen.getByLabelText('Fahrzeug'));
    await user.click(await screen.findByRole('option', { name: 'TLF' }));

    expect(await screen.findByLabelText('Kilometerstand — Start')).toHaveValue(
      1200,
    );
  });

  it('zeigt nach dem Speichern eine Bestätigung statt des Formulars', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await user.click(screen.getByLabelText('Fahrzeug'));
    await user.click(await screen.findByRole('option', { name: 'TLF' }));
    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0]).toBe('tok');
    expect(await screen.findByText('Fahrt eingetragen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fahrzeug')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Weitere Fahrt erfassen' }),
    ).toBeInTheDocument();
  });

  it('zeigt eine Meldung, wenn der Link zwischenzeitlich widerrufen wurde', async () => {
    createMock.mockResolvedValue({ success: false, error: 'linkInvalid' });
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await user.click(screen.getByLabelText('Fahrzeug'));
    await user.click(await screen.findByRole('option', { name: 'TLF' }));
    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    expect(
      await screen.findByText('Dieser Link ist nicht mehr gültig.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Fahrzeug')).toBeInTheDocument();
  });

  it('zeigt eine übersetzte Meldung bei einer sonstigen Ablehnung und behält das Formular', async () => {
    createMock.mockResolvedValue({ success: false, error: 'vehicleNotFound' });
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await user.click(screen.getByLabelText('Fahrzeug'));
    await user.click(await screen.findByRole('option', { name: 'TLF' }));
    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    expect(
      await screen.findByText('Das gewählte Fahrzeug ist nicht mehr verfügbar.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Fahrzeug')).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('belegt das Fahrzeug aus dem Link vor', async () => {
    const two = {
      ...data,
      vehicles: [
        ...data.vehicles,
        { ...data.vehicles[0], id: 'v2', name: 'MTF', lastCounters: { km: 90 } },
      ],
    };
    renderWithIntl(
      <ShareLinkEntryForm token="tok" data={two} vehicleId="v2" />,
    );

    expect(screen.getByLabelText('Fahrzeug')).toHaveTextContent('MTF');
    // Der Zählerstand muss zum vorbelegten Fahrzeug passen — sonst trüge der
    // Aufkleber im MTF den Kilometerstand des TLF ein.
    expect(await screen.findByLabelText('Kilometerstand — Start')).toHaveValue(
      90,
    );
  });

  it('behält die Vorauswahl nach „Weitere Fahrt erfassen"', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ShareLinkEntryForm token="tok" data={data} vehicleId="v1" />,
    );

    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));
    await user.click(
      await screen.findByRole('button', { name: 'Weitere Fahrt erfassen' }),
    );

    // Zwei Fahrten hintereinander sind am Fahrzeug der Normalfall; die zweite
    // darf die Fahrzeugwahl nicht erneut verlangen.
    expect(await screen.findByLabelText('Fahrzeug')).toHaveTextContent('TLF');
  });

  it('zeigt einen Titel und den Gruppennamen, wenn keine Fahrzeuge hinterlegt sind', () => {
    renderWithIntl(
      <ShareLinkEntryForm token="tok" data={{ ...data, vehicles: [] }} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Fahrt erfassen' }),
    ).toBeInTheDocument();
    expect(screen.getByText('FF Neusiedl am See')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Für diese Gruppe sind keine aktiven Fahrzeuge hinterlegt.',
      ),
    ).toBeInTheDocument();
  });

  it('liefert nach „Weitere Fahrt erfassen" ein leeres Formular und lädt die Stammdaten neu', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkEntryForm token="tok" data={data} />);

    await user.click(screen.getByLabelText('Fahrzeug'));
    await user.click(await screen.findByRole('option', { name: 'TLF' }));
    await pasteInto(user, screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await pasteInto(
      user,
      await screen.findByLabelText('Kilometerstand — Ende'),
      '1250',
    );
    await user.click(screen.getByRole('button', { name: 'Fahrt eintragen' }));

    await user.click(
      await screen.findByRole('button', { name: 'Weitere Fahrt erfassen' }),
    );

    expect(await screen.findByLabelText('Fahrer')).toHaveValue('');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
