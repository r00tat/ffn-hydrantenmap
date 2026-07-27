// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- Mocks for module-level dependencies -------------------------------------

const addDocMock = vi.fn(
  async (..._args: unknown[]) => ({ id: 'new-firecall-id' }),
);
const setDocMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../lib/firestoreClient', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
}));

vi.mock('../firebase/firebase', () => ({ firestore: {} }));

const getBlaulichtSmsAlarmsMock = vi.fn(
  async (..._args: unknown[]): Promise<unknown[]> => [],
);
const getFirecallsByAlarmIdsMock = vi.fn(
  async (
    ..._args: unknown[]
  ): Promise<Record<string, { id: string; name: string }>> => ({}),
);
vi.mock('../../app/blaulicht-sms/actions', () => ({
  getBlaulichtSmsAlarms: (...args: unknown[]) =>
    getBlaulichtSmsAlarmsMock(...args),
  getFirecallsByAlarmIds: (...args: unknown[]) =>
    getFirecallsByAlarmIdsMock(...args),
}));

vi.mock('../../app/blaulicht-sms/credentialsActions', () => ({
  getGroupsWithBlaulichtsmsConfig: vi.fn(async () => []),
}));

const showSnackbarMock = vi.fn();
vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbarMock,
}));

vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({
    email: 'test@example.com',
    myGroups: [{ id: 'ffnd', name: 'FF Neusiedl' }],
  }),
}));

vi.mock('../../hooks/useFirecall', () => ({
  useFirecallSelect: () => vi.fn(),
}));

vi.mock('../inputs/FileUploader', () => ({ default: () => null }));
vi.mock('../inputs/FileDisplay', () => ({ default: () => null }));
vi.mock('../inputs/AutoSnapshotIntervalSelect', () => ({ default: () => null }));

import EinsatzDialog from './EinsatzDialog';

const ALARM_ID = 'alarm-1';

const einsatzFromAlarm = {
  name: 'G1 Ölspur Neusiedl am See',
  group: 'ffnd',
  fw: 'Neusiedl am See',
  date: '2026-07-27T12:49:32.000Z',
  description: 'Neusiedl am See/SA2/G1/Ölspur/Neusiedl am See/Am Tabor/7',
  blaulichtSmsAlarmId: ALARM_ID,
  blaulichtSmsAlarmIds: [ALARM_ID],
  deleted: false,
};

describe('EinsatzDialog duplicate check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addDocMock.mockResolvedValue({ id: 'new-firecall-id' });
    getBlaulichtSmsAlarmsMock.mockResolvedValue([]);
    getFirecallsByAlarmIdsMock.mockResolvedValue({});
  });

  const clickSave = async () => {
    const user = userEvent.setup();
    const saveButton = await screen.findByRole('button', {
      name: /hinzufügen|speichern|aktualisieren/i,
    });
    await user.click(saveButton);
    return user;
  };

  it('saves directly when no other firecall is linked to the alarm', async () => {
    const onClose = vi.fn();
    render(<EinsatzDialog einsatz={einsatzFromAlarm} onClose={onClose} />);

    await clickSave();

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
    expect(getFirecallsByAlarmIdsMock).toHaveBeenCalledWith([ALARM_ID]);
    expect(
      screen.queryByText(/existiert bereits/i),
    ).not.toBeInTheDocument();
  });

  it('warns instead of saving when a firecall already exists for the alarm', async () => {
    getFirecallsByAlarmIdsMock.mockResolvedValue({
      [ALARM_ID]: { id: 'existing-id', name: 'G1 Ölspur Neusiedl am See' },
    });
    render(<EinsatzDialog einsatz={einsatzFromAlarm} onClose={vi.fn()} />);

    await clickSave();

    expect(
      await screen.findByText(/Einsatz existiert bereits/i),
    ).toBeInTheDocument();
    // The existing Einsatz is named so the user can recognise it.
    expect(
      screen.getByText(/G1 Ölspur Neusiedl am See/),
    ).toBeInTheDocument();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('creates the firecall anyway once the warning is confirmed', async () => {
    getFirecallsByAlarmIdsMock.mockResolvedValue({
      [ALARM_ID]: { id: 'existing-id', name: 'Bestehender Einsatz' },
    });
    render(<EinsatzDialog einsatz={einsatzFromAlarm} onClose={vi.fn()} />);

    const user = await clickSave();
    await screen.findByText(/Einsatz existiert bereits/i);

    await user.click(screen.getByRole('button', { name: /trotzdem anlegen/i }));

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
  });

  it('does not create the firecall when the warning is cancelled', async () => {
    getFirecallsByAlarmIdsMock.mockResolvedValue({
      [ALARM_ID]: { id: 'existing-id', name: 'Bestehender Einsatz' },
    });
    render(<EinsatzDialog einsatz={einsatzFromAlarm} onClose={vi.fn()} />);

    const user = await clickSave();
    await screen.findByText(/Einsatz existiert bereits/i);

    await user.click(screen.getByRole('button', { name: /abbrechen/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Einsatz existiert bereits/i)).not.toBeInTheDocument(),
    );
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('writes deleted: false so the new firecall is visible in the overview', async () => {
    render(<EinsatzDialog einsatz={einsatzFromAlarm} onClose={vi.fn()} />);

    await clickSave();

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
    const payload = addDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.deleted).toBe(false);
  });

  it('saves anyway when the duplicate check fails', async () => {
    getFirecallsByAlarmIdsMock.mockRejectedValue(new Error('offline'));
    render(<EinsatzDialog einsatz={einsatzFromAlarm} onClose={vi.fn()} />);

    await clickSave();

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
    expect(showSnackbarMock).toHaveBeenCalledWith(
      expect.stringContaining('Prüfung'),
      'warning',
    );
  });
});
