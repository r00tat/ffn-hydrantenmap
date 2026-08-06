// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';

// `stammdatenActions` ist eine 'use server'/'server-only'-Datei und lässt sich
// im Test nicht laden.
const { getFahrtenbuchMangelEmails, saveFahrtenbuchMangelEmails } = vi.hoisted(
  () => ({
    getFahrtenbuchMangelEmails: vi.fn(),
    saveFahrtenbuchMangelEmails: vi.fn(),
  }),
);

vi.mock('../stammdatenActions', () => ({
  getFahrtenbuchMangelEmails,
  saveFahrtenbuchMangelEmails,
}));

import MangelNotificationSettings from './MangelNotificationSettings';

describe('MangelNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFahrtenbuchMangelEmails.mockResolvedValue({
      success: true,
      emails: ['zeugwart@example.at'],
    });
    saveFahrtenbuchMangelEmails.mockResolvedValue({ success: true });
  });

  it('zeigt die gepflegten Empfänger an', async () => {
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);

    expect(await screen.findByText('zeugwart@example.at')).toBeInTheDocument();
    expect(getFahrtenbuchMangelEmails).toHaveBeenCalledWith('ffnd');
  });

  it('speichert eine hinzugefügte Adresse', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.type(
      screen.getByLabelText('E-Mail-Adressen'),
      'kommandant@example.at{enter}',
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(saveFahrtenbuchMangelEmails).toHaveBeenCalledWith('ffnd', [
        'zeugwart@example.at',
        'kommandant@example.at',
      ]);
    });
    expect(await screen.findByText('Empfänger gespeichert.')).toBeInTheDocument();
  });

  it('speichert eine geleerte Liste als Abschaltung', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    // Das Löschkreuz des Chips — der einzige Weg, die Benachrichtigung wieder
    // abzuschalten.
    await user.click(screen.getByTestId('CancelIcon'));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(saveFahrtenbuchMangelEmails).toHaveBeenCalledWith('ffnd', []);
    });
  });

  it('meldet eine ungültige Adresse verständlich', async () => {
    const user = userEvent.setup();
    saveFahrtenbuchMangelEmails.mockResolvedValue({
      success: false,
      error: 'emailInvalid',
    });
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Bitte gültige E-Mail-Adressen eintragen.'),
    ).toBeInTheDocument();
  });

  it('meldet zu viele Empfänger mit der Obergrenze', async () => {
    const user = userEvent.setup();
    saveFahrtenbuchMangelEmails.mockResolvedValue({
      success: false,
      error: 'tooManyEmails',
    });
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Es sind höchstens 10 Empfänger möglich.'),
    ).toBeInTheDocument();
  });

  it('meldet einen unbekannten Fehler im Klartext', async () => {
    const user = userEvent.setup();
    saveFahrtenbuchMangelEmails.mockResolvedValue({
      success: false,
      error: 'kein Admin',
    });
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/kein Admin/)).toBeInTheDocument();
  });

  it('meldet einen Fehler beim Laden, statt eine leere Liste zu zeigen', async () => {
    // Ohne die Meldung sähe das Formular wie „nichts gepflegt" aus — ein
    // Speichern darauf löschte die tatsächlich gepflegten Empfänger.
    getFahrtenbuchMangelEmails.mockResolvedValue({
      success: false,
      emails: [],
      error: 'kein Admin',
    });
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);

    expect(await screen.findByText(/kein Admin/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Speichern' }),
    ).toBeDisabled();
  });

  it('sperrt das Speichern, solange geladen wird', () => {
    renderWithIntl(<MangelNotificationSettings groupId="ffnd" />);
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });
});
