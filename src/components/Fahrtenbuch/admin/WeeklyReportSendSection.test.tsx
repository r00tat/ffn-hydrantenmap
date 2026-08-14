// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';

// Beide Module sind 'use server'/'server-only' und im Test nicht ladbar.
const { getFahrtenbuchMangelEmails, sendWeeklyReportNow } = vi.hoisted(() => ({
  getFahrtenbuchMangelEmails: vi.fn(),
  sendWeeklyReportNow: vi.fn(),
}));

vi.mock('../stammdatenActions', () => ({ getFahrtenbuchMangelEmails }));
vi.mock('../weeklyReportAdminActions', () => ({ sendWeeklyReportNow }));

import WeeklyReportSendSection from './WeeklyReportSendSection';

const sentResult = {
  groupId: 'ffnd',
  status: 'sent' as const,
  recipientCount: 1,
  entryCount: 3,
  warningCount: 1,
  openMangelCount: 2,
};

/**
 * Ein fester Tag, damit die Vorbelegung der Woche prüfbar ist: Freitag der
 * KW33/2026 — die letzte abgeschlossene Woche ist die KW32 vom 03. bis 09.08.
 *
 * Nur `Date` wird gefälscht, damit `waitFor` und `userEvent` weiterhin mit
 * echten Timern arbeiten.
 */
function freezeToKw33() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-14T08:00:00Z'));
}

describe('WeeklyReportSendSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFahrtenbuchMangelEmails.mockResolvedValue({
      success: true,
      emails: ['zeugwart@example.at'],
    });
    sendWeeklyReportNow.mockResolvedValue({
      success: true,
      result: sentResult,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('belegt Jahr und Woche mit der letzten abgeschlossenen Woche vor', async () => {
    freezeToKw33();
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);

    expect(await screen.findByText('zeugwart@example.at')).toBeInTheDocument();
    expect(screen.getByLabelText('Jahr')).toHaveValue(2026);
    expect(screen.getByLabelText('KW')).toHaveValue(32);
    expect(
      screen.getByText('Zeitraum: 03.08.2026 – 09.08.2026'),
    ).toBeInTheDocument();
  });

  it('zeigt die gepflegten Empfänger als Vorbelegung', async () => {
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);
    expect(await screen.findByText('zeugwart@example.at')).toBeInTheDocument();
    expect(getFahrtenbuchMangelEmails).toHaveBeenCalledWith('ffnd');
  });

  it('zeigt die Vorschau ohne zu verschicken', async () => {
    freezeToKw33();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    sendWeeklyReportNow.mockResolvedValue({
      success: true,
      result: {
        ...sentResult,
        status: 'dryRun',
        subject: 'Fahrtenbuch-Wochenbericht KW32 — FF Neusiedl am See',
        text: 'KDTFA (ND-1)\n05.08.2026 19:00 - 19:34',
      },
    });
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.click(screen.getByRole('button', { name: 'Vorschau' }));

    await waitFor(() => {
      expect(sendWeeklyReportNow).toHaveBeenCalledWith({
        groupId: 'ffnd',
        year: 2026,
        week: 32,
        recipients: ['zeugwart@example.at'],
        dryRun: true,
      });
    });
    expect(
      await screen.findByText(/Fahrtenbuch-Wochenbericht KW32/),
    ).toBeInTheDocument();
    expect(screen.getByText(/KDTFA \(ND-1\)/)).toBeInTheDocument();
  });

  it('verschickt erst nach der Bestätigung', async () => {
    freezeToKw33();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.click(screen.getByRole('button', { name: 'Versenden' }));
    // Der Dialog nennt Woche und Adressen — bis hierhin ist nichts passiert.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('KW32 2026 an eine Adresse');
    expect(dialog).toHaveTextContent('zeugwart@example.at');
    expect(sendWeeklyReportNow).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Versenden' }));

    await waitFor(() => {
      expect(sendWeeklyReportNow).toHaveBeenCalledWith({
        groupId: 'ffnd',
        year: 2026,
        week: 32,
        recipients: ['zeugwart@example.at'],
        dryRun: false,
      });
    });
    expect(
      await screen.findByText(
        'Verschickt: 3 Fahrten, eine Warnung, 2 offene Mängel.',
      ),
    ).toBeInTheDocument();
  });

  it('verschickt an eine überschriebene Adresse statt an die gepflegte', async () => {
    freezeToKw33();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    // Chip entfernen und eine eigene Adresse eintragen.
    await user.click(screen.getByTestId('CancelIcon'));
    await user.type(
      screen.getByLabelText('Empfänger dieses Versands'),
      'ich@example.at{enter}',
    );
    await user.click(screen.getByRole('button', { name: 'Versenden' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Versenden' }));

    await waitFor(() => {
      expect(sendWeeklyReportNow.mock.calls[0][0]).toMatchObject({
        recipients: ['ich@example.at'],
      });
    });
  });

  it('sperrt die Knöpfe bei einer unmöglichen Kalenderwoche', async () => {
    const user = userEvent.setup();
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    // 2025 hat keine KW53.
    await user.clear(screen.getByLabelText('Jahr'));
    await user.type(screen.getByLabelText('Jahr'), '2025');
    await user.clear(screen.getByLabelText('KW'));
    await user.type(screen.getByLabelText('KW'), '53');

    expect(
      await screen.findByText('Keine gültige Kalenderwoche dieses Jahres.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Versenden' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vorschau' })).toBeDisabled();
  });

  it('meldet einen gescheiterten Versand, obwohl die Action erfolgreich antwortet', async () => {
    // `sendWeeklyReportForGroup` fasst einen Fehler in das Ergebnis, statt zu
    // werfen — ein `success: true` allein heißt nicht, dass die Mail draußen ist.
    freezeToKw33();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    sendWeeklyReportNow.mockResolvedValue({
      success: true,
      result: { ...sentResult, status: 'failed', error: 'gmail down' },
    });
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.click(screen.getByRole('button', { name: 'Versenden' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Versenden' }));

    expect(await screen.findByText(/gmail down/)).toBeInTheDocument();
  });

  it('übersetzt den Schlüssel einer ungültigen Adresse', async () => {
    freezeToKw33();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    sendWeeklyReportNow.mockResolvedValue({
      success: false,
      error: 'emailInvalid',
    });
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);
    await screen.findByText('zeugwart@example.at');

    await user.click(screen.getByRole('button', { name: 'Vorschau' }));

    expect(
      await screen.findByText(
        'Mindestens eine Adresse ist keine gültige E-Mail-Adresse.',
      ),
    ).toBeInTheDocument();
  });

  it('sperrt den Versand, wenn die Empfänger nicht ladbar sind', async () => {
    // Sonst ginge ein Versand los, ohne dass bekannt ist, wer eigentlich
    // gepflegt ist.
    getFahrtenbuchMangelEmails.mockResolvedValue({
      success: false,
      emails: [],
      error: 'kein Admin',
    });
    renderWithIntl(<WeeklyReportSendSection groupId="ffnd" />);

    expect(await screen.findByText(/kein Admin/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Versenden' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vorschau' })).toBeDisabled();
  });
});
