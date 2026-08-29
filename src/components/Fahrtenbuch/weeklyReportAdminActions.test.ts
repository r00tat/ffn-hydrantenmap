import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { actionGroupAdminRequiredMock, actionUserRequiredMock, sendMock } = vi.hoisted(
  () => ({
    actionGroupAdminRequiredMock: vi.fn(),
    actionUserRequiredMock: vi.fn(),
    sendMock: vi.fn(),
  }),
);

// Der Guard ist gemockt, seine Mandanten-Sperre bleibt aber echt.
vi.mock('../../app/auth', async () => {
  const { assertTenantGroup } = await vi.importActual<
    typeof import('../../app/groups/groupTypes')
  >('../../app/groups/groupTypes');
  return {
    actionGroupAdminRequired: (groupId: string) => {
      assertTenantGroup(groupId);
      return actionGroupAdminRequiredMock(groupId);
    },
    // `authGuards` importiert diese Funktion; sie wird hier nicht aufgerufen,
    // muss aber vorhanden sein, damit der Named Import nicht scheitert.
    actionUserRequired: () => actionUserRequiredMock(),
  };
});

vi.mock('./sendWeeklyReports', () => ({
  sendWeeklyReportForGroup: (options: unknown) => sendMock(options),
}));

import { FAHRTENBUCH_MANGEL_EMAILS_MAX } from '../../common/fahrtenbuch';
import { sendWeeklyReportNow } from './weeklyReportAdminActions';

const sentResult = {
  groupId: 'ffnd',
  status: 'sent' as const,
  recipientCount: 1,
  entryCount: 3,
  warningCount: 1,
  openMangelCount: 2,
};

describe('sendWeeklyReportNow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionGroupAdminRequiredMock.mockResolvedValue({ user: { id: 'admin-1' } });
    sendMock.mockResolvedValue(sentResult);
  });

  it('prüft die Admin-Berechtigung und reicht den Zeitraum aufgelöst weiter', async () => {
    const result = await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2026,
      week: 32,
      recipients: ['kommandant@example.at'],
    });

    expect(actionGroupAdminRequiredMock).toHaveBeenCalled();
    expect(result).toEqual({ success: true, result: sentResult });
    expect(sendMock).toHaveBeenCalledWith({
      groupId: 'ffnd',
      period: expect.objectContaining({
        from: '2026-08-03',
        to: '2026-08-09',
        week: 32,
      }),
      recipients: ['kommandant@example.at'],
      dryRun: false,
    });
  });

  it('reicht dryRun durch', async () => {
    await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2026,
      week: 32,
      recipients: ['a@example.at'],
      dryRun: true,
    });
    expect(sendMock.mock.calls[0][0]).toMatchObject({ dryRun: true });
  });

  it('lehnt eine Gruppe ab, die kein Mandant ist', async () => {
    // `allUsers` steht in den Claims jedes Benutzers und in denen von
    // Einsatz-Gasttokens — dieselbe Sperre wie in den Stammdaten-Actions.
    const result = await sendWeeklyReportNow({
      groupId: 'allUsers',
      year: 2026,
      week: 32,
      recipients: ['a@example.at'],
    });
    expect(result.success).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('meldet eine unmögliche Kalenderwoche mit ihrem Schlüssel', async () => {
    // 2025 hat keine KW53; die Anfrage darf nicht stillschweigend auf die KW1
    // des Folgejahres rutschen.
    const result = await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2025,
      week: 53,
      recipients: ['a@example.at'],
    });
    expect(result).toMatchObject({ success: false, error: 'invalidWeek' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('lehnt eine ungültige Adresse ab', async () => {
    const result = await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2026,
      week: 32,
      recipients: ['kein-mail'],
    });
    expect(result).toMatchObject({ success: false, error: 'emailInvalid' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('lehnt zu viele Adressen ab', async () => {
    const many = Array.from(
      { length: FAHRTENBUCH_MANGEL_EMAILS_MAX + 1 },
      (_, i) => `a${i}@example.at`,
    );
    const result = await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2026,
      week: 32,
      recipients: many,
    });
    expect(result).toMatchObject({ success: false, error: 'tooManyEmails' });
  });

  it('lehnt eine leere Empfängerliste ab, statt auf die gepflegte zurückzufallen', async () => {
    // Wer das Feld leer räumt, will nicht ausgerechnet die Liste bemailen, die
    // er gerade entfernt hat.
    const result = await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2026,
      week: 32,
      recipients: [],
    });
    expect(result).toMatchObject({ success: false, error: 'noRecipients' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('entdoppelt Adressen, bevor sie zu Empfängern werden', async () => {
    await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2026,
      week: 32,
      recipients: ['a@example.at', ' a@example.at '],
    });
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      recipients: ['a@example.at'],
    });
  });

  it('fasst einen Fehler des Versands als Ergebnis', async () => {
    sendMock.mockRejectedValue(new Error('gmail down'));
    const result = await sendWeeklyReportNow({
      groupId: 'ffnd',
      year: 2026,
      week: 32,
      recipients: ['a@example.at'],
    });
    expect(result).toMatchObject({ success: false, error: 'gmail down' });
  });
});
