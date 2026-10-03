// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- Mocks for module-level dependencies -------------------------------------

// Lokale Schreibhelfer kehren sofort zurück. Die wartenden Varianten erfüllen
// sich nie — so verhält sich Firestore offline. Der Dialog darf sie nicht
// benutzen, sonst hinge er.
const addDocMock = vi.fn((..._args: unknown[]) => ({ id: 'new-firecall-id' }));
const setDocMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock('../../lib/firestoreClient', () => ({
  addDocLocal: (...args: unknown[]) => addDocMock(...args),
  setDocLocal: (...args: unknown[]) => setDocMock(...args),
  addDoc: () => new Promise<never>(() => {}),
  setDoc: () => new Promise<never>(() => {}),
}));

const selectFirecallMock = vi.fn();

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

const getGroupsWithConfigMock = vi.fn(
  async (..._args: unknown[]): Promise<string[]> => [],
);
vi.mock('../../app/blaulicht-sms/credentialsActions', () => ({
  getGroupsWithBlaulichtsmsConfig: (...args: unknown[]) =>
    getGroupsWithConfigMock(...args),
}));

const onlineState = vi.hoisted(() => ({ value: true }));
vi.mock('../../hooks/useOnline', () => ({ default: () => onlineState.value }));

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
  useFirecallSelect: () => selectFirecallMock,
}));

vi.mock('../inputs/FileUploader', () => ({ default: () => null }));
vi.mock('../inputs/AttachmentGallery', () => ({ default: () => null }));
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
    addDocMock.mockReturnValue({ id: 'new-firecall-id' });
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

describe('EinsatzDialog offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addDocMock.mockReturnValue({ id: 'local-firecall-id' });
    getBlaulichtSmsAlarmsMock.mockResolvedValue([]);
  });

  it('closes and selects the new firecall although the server never confirms', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EinsatzDialog
        einsatz={{ name: 'Offline-Einsatz', group: 'ffnd', deleted: false }}
        onClose={onClose}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: /hinzufügen|speichern/i }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(selectFirecallMock).toHaveBeenCalledWith('local-firecall-id');
  });

  it('closes after editing an existing firecall without waiting for the server', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EinsatzDialog
        einsatz={{ id: 'fc-1', name: 'Bestand', group: 'ffnd', deleted: false }}
        onClose={onClose}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: /aktualisieren|speichern/i }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });
});

describe('EinsatzDialog without connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onlineState.value = false;
    addDocMock.mockReturnValue({ id: 'local-firecall-id' });
    getBlaulichtSmsAlarmsMock.mockResolvedValue([]);
    getFirecallsByAlarmIdsMock.mockResolvedValue({});
  });

  afterEach(() => {
    onlineState.value = true;
  });

  it('skips the BlaulichtSMS import and says so', async () => {
    render(<EinsatzDialog onClose={vi.fn()} />);

    expect(
      await screen.findByText(/Blaulicht-SMS-Alarme können nicht geladen werden/),
    ).toBeInTheDocument();
    expect(getGroupsWithConfigMock).not.toHaveBeenCalled();
    expect(getBlaulichtSmsAlarmsMock).not.toHaveBeenCalled();
  });

  it('skips the duplicate check and saves with a hint', async () => {
    const onClose = vi.fn();
    render(<EinsatzDialog einsatz={einsatzFromAlarm} onClose={onClose} />);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /hinzufügen|speichern/i }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(getFirecallsByAlarmIdsMock).not.toHaveBeenCalled();
    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect(showSnackbarMock).toHaveBeenCalledWith(
      expect.stringContaining('übersprungen'),
      'info',
    );
  });
});
