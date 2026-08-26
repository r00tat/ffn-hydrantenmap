// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { proposeMock, saveMock } = vi.hoisted(() => ({
  proposeMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock('../stammdatenActions', () => ({
  proposePersonUserLinks: (...args: unknown[]) => proposeMock(...args),
  savePersonUserLinks: (...args: unknown[]) => saveMock(...args),
}));

import { renderWithIntl } from '../../../test-utils/intlRender';
import type { PersonUserMatch } from '../personUserMatch';
import PersonUserLinkDialog from './PersonUserLinkDialog';

const unique: PersonUserMatch = {
  personId: 'p1',
  personName: 'Adrian Schennet',
  status: 'unique',
  linkedUserIds: [],
  candidates: [
    { uid: 'u1', displayName: 'Adrian Schennet', email: 'adrian@ff.at' },
  ],
};

const ambiguous: PersonUserMatch = {
  personId: 'p2',
  personName: 'Doppelt Registriert',
  status: 'ambiguous',
  linkedUserIds: [],
  candidates: [
    { uid: 'u2', displayName: 'Doppelt Registriert', email: 'erst@ff.at' },
    { uid: 'u3', displayName: 'Doppelt Registriert', email: 'zweit@ff.at' },
  ],
};

const none: PersonUserMatch = {
  personId: 'p3',
  personName: 'Ohne Konto',
  status: 'none',
  linkedUserIds: [],
  candidates: [],
};

const linked: PersonUserMatch = {
  personId: 'p4',
  personName: 'Schon Verknüpft',
  status: 'linked',
  linkedUserIds: ['u4'],
  candidates: [],
};

function render(matches: PersonUserMatch[]) {
  proposeMock.mockResolvedValue({ success: true, matches });
  return renderWithIntl(
    <PersonUserLinkDialog open groupId="ffnd" onClose={vi.fn()} />,
  );
}

/** Die Tabellenzeile einer Person. */
async function row(name: string) {
  const cell = await screen.findByText(name);
  return cell.closest('tr')!;
}

describe('PersonUserLinkDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue({ success: true });
  });

  it('hakt einen eindeutigen Treffer vor', async () => {
    render([unique]);

    const line = await row('Adrian Schennet');
    expect(within(line).getByRole('checkbox')).toBeChecked();
  });

  it('lässt einen mehrdeutigen Vorschlag ungehakt', async () => {
    // Ein vorgehakter mehrdeutiger Vorschlag überspränge genau die Prüfung,
    // für die dieser Dialog da ist.
    render([ambiguous]);

    const line = await row('Doppelt Registriert');
    for (const box of within(line).getAllByRole('checkbox')) {
      expect(box).not.toBeChecked();
    }
    expect(within(line).getByText('Entscheidung nötig')).toBeInTheDocument();
  });

  it('zeigt bei gleichnamigen Konten die E-Mail zur Unterscheidung', async () => {
    render([ambiguous]);

    const line = await row('Doppelt Registriert');
    expect(within(line).getByText(/erst@ff\.at/)).toBeInTheDocument();
    expect(within(line).getByText(/zweit@ff\.at/)).toBeInTheDocument();
  });

  it('meldet eine Person ohne Konto, ohne Auswahl anzubieten', async () => {
    render([none]);

    const line = await row('Ohne Konto');
    expect(within(line).getByText('Kein Konto gefunden')).toBeInTheDocument();
    expect(within(line).queryByRole('checkbox')).toBeNull();
  });

  it('speichert nur die geänderten Zeilen', async () => {
    render([unique, ambiguous, none]);

    const button = await screen.findByRole('button', {
      name: '1 Zuordnung speichern',
    });
    await userEvent.click(button);

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalledWith('ffnd', [
      { personId: 'p1', userIds: ['u1'] },
    ]);
  });

  it('übernimmt eine Entscheidung bei mehreren Konten', async () => {
    // Dieselbe Person mit zwei Registrierungen: beide dürfen zugeordnet werden.
    render([ambiguous]);

    const line = await row('Doppelt Registriert');
    const boxes = within(line).getAllByRole('checkbox');
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[1]!);

    await userEvent.click(
      screen.getByRole('button', { name: '1 Zuordnung speichern' }),
    );

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalledWith('ffnd', [
      { personId: 'p2', userIds: ['u2', 'u3'] },
    ]);
  });

  it('verbirgt verknüpfte Personen, bis sie angefordert werden', async () => {
    render([unique, linked]);

    await screen.findByText('Adrian Schennet');
    expect(screen.queryByText('Schon Verknüpft')).toBeNull();

    await userEvent.click(
      screen.getByLabelText('Verknüpfte Personen anzeigen'),
    );

    expect(await screen.findByText('Schon Verknüpft')).toBeInTheDocument();
  });

  it('löst eine bestehende Verknüpfung', async () => {
    render([linked]);

    await userEvent.click(
      screen.getByLabelText('Verknüpfte Personen anzeigen'),
    );
    const line = await row('Schon Verknüpft');
    await userEvent.click(
      within(line).getByRole('button', { name: 'Verknüpfung lösen' }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: '1 Zuordnung speichern' }),
    );

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalledWith('ffnd', [
      { personId: 'p4', userIds: [] },
    ]);
  });

  it('weist ein gesperrtes oder gruppenfremdes Konto aus', async () => {
    render([
      {
        ...unique,
        candidates: [
          {
            uid: 'u1',
            displayName: 'Adrian Schennet',
            email: 'adrian@ff.at',
            disabled: true,
            isAuthorized: false,
            inGroup: false,
          },
        ],
      },
    ]);

    const line = await row('Adrian Schennet');
    expect(within(line).getByText('gesperrt')).toBeInTheDocument();
    expect(within(line).getByText('nicht freigeschaltet')).toBeInTheDocument();
    expect(within(line).getByText('nicht in dieser Gruppe')).toBeInTheDocument();
  });

  it('nennt die konkurrierende Person bei einem umkämpften Konto', async () => {
    render([
      {
        personId: 'p1',
        personName: 'Josef Haider',
        status: 'ambiguous',
        linkedUserIds: [],
        candidates: [{ uid: 'u1', displayName: 'Josef Haider' }],
        contestedBy: ['p2'],
      },
      {
        personId: 'p2',
        personName: 'Josef Haider senior',
        status: 'ambiguous',
        linkedUserIds: [],
        candidates: [{ uid: 'u1', displayName: 'Josef Haider' }],
        contestedBy: ['p1'],
      },
    ]);

    const line = await row('Josef Haider');
    expect(
      within(line).getByText(/Josef Haider senior/),
    ).toBeInTheDocument();
  });

  it('erklärt ein Konto, das schon einer anderen Person gehört', async () => {
    render([
      {
        personId: 'p2',
        personName: 'Josef Haider junior',
        status: 'none',
        linkedUserIds: [],
        candidates: [],
        takenBy: ['p1'],
      },
      {
        personId: 'p1',
        personName: 'Josef Haider',
        status: 'linked',
        linkedUserIds: ['u1'],
        candidates: [],
      },
    ]);

    const line = await row('Josef Haider junior');
    expect(
      within(line).getByText('Ein passendes Konto ist schon zugeordnet zu: Josef Haider'),
    ).toBeInTheDocument();
  });

  it('bietet an einer verknüpften Person das weitere Konto an', async () => {
    // Zweitregistrierung: nicht im Arbeitsstapel, aber erreichbar.
    render([
      {
        personId: 'p1',
        personName: 'Adrian Schennet',
        status: 'linked',
        linkedUserIds: ['u1'],
        candidates: [
          { uid: 'u2', displayName: 'Adrian Schennet', email: 'zweit@ff.at' },
        ],
      },
    ]);

    await userEvent.click(
      screen.getByLabelText('Verknüpfte Personen anzeigen'),
    );
    const line = await row('Adrian Schennet');
    const box = within(line).getByRole('checkbox');
    expect(box).not.toBeChecked();

    await userEvent.click(box);
    await userEvent.click(
      screen.getByRole('button', { name: '1 Zuordnung speichern' }),
    );

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalledWith('ffnd', [
      { personId: 'p1', userIds: ['u1', 'u2'] },
    ]);
  });

  it('meldet einen fehlgeschlagenen Abruf', async () => {
    proposeMock.mockResolvedValue({ success: false, error: 'kein Admin' });
    renderWithIntl(
      <PersonUserLinkDialog open groupId="ffnd" onClose={vi.fn()} />,
    );

    expect(
      await screen.findByText('Der Vorschlag konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Speichervorgang', async () => {
    saveMock.mockResolvedValue({ success: false, error: 'kaputt' });
    render([unique]);

    await userEvent.click(
      await screen.findByRole('button', { name: '1 Zuordnung speichern' }),
    );

    expect(
      await screen.findByText(
        'Die Zuordnung konnte nicht gespeichert werden.',
      ),
    ).toBeInTheDocument();
  });

  it('lädt nach dem Speichern neu, damit nichts doppelt geschrieben wird', async () => {
    render([unique]);

    await userEvent.click(
      await screen.findByRole('button', { name: '1 Zuordnung speichern' }),
    );

    await waitFor(() => expect(proposeMock).toHaveBeenCalledTimes(2));
  });
});
