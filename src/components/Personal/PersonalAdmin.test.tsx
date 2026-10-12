// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';

const { personsMock } = vi.hoisted(() => ({ personsMock: vi.fn() }));
vi.mock('../../hooks/useFahrtenbuchPersons', () => ({
  default: () => personsMock(),
}));
vi.mock('../Fahrtenbuch/stammdatenActions', () => ({
  saveFahrtenbuchPerson: vi.fn().mockResolvedValue({ success: true, id: 'neu' }),
  deleteFahrtenbuchPerson: vi.fn().mockResolvedValue({ success: true }),
  setPersonFlag: vi.fn().mockResolvedValue({ success: true }),
  listPersonUserCandidates: vi.fn().mockResolvedValue({
    success: true,
    candidates: [
      { uid: 'u1', displayName: 'Muster Anna', email: 'anna@example.org', inGroup: true, isAuthorized: true },
      { uid: 'u2', displayName: 'Beispiel Bernd', inGroup: true, isAuthorized: true },
    ],
  }),
  savePersonUserLinks: vi.fn().mockResolvedValue({ success: true }),
  proposePersonUserLinks: vi.fn(),
  previewPersonCsvImport: vi.fn(),
  importPersonsFromCsv: vi.fn(),
}));

import {
  saveFahrtenbuchPerson,
  savePersonUserLinks,
  setPersonFlag,
} from '../Fahrtenbuch/stammdatenActions';
import PersonalAdmin from './PersonalAdmin';

function person(overrides: Partial<FahrtenbuchPerson>): FahrtenbuchPerson {
  return {
    id: 'p1',
    name: 'Muster Anna',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const anna = person({ id: 'p1', name: 'Muster Anna', userIds: ['u1'] });
const bernd = person({
  id: 'p2',
  name: 'Beispiel Bernd',
  kraftfahrer: false,
  atemschutztraeger: true,
  blaulichtSmsRecipientId: '4711',
});
const clara = person({ id: 'p3', name: 'Ehemalig Clara', active: false });

beforeEach(() => {
  vi.clearAllMocks();
  personsMock.mockReturnValue({ persons: [anna, bernd, clara] });
});

function row(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

describe('PersonalAdmin', () => {
  it('blendet Inaktive aus, bis sie eingeblendet werden', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    expect(screen.getByText('Muster Anna')).toBeInTheDocument();
    expect(screen.queryByText('Ehemalig Clara')).toBeNull();

    await user.click(screen.getByLabelText('Inaktive anzeigen'));

    expect(screen.getByText('Ehemalig Clara')).toBeInTheDocument();
  });

  it('zeigt die Zusammenfassung über die aktiven Personen', () => {
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    expect(
      screen.getByText('2 aktiv · 1 Kraftfahrer · 1 Atemschutzträger'),
    ).toBeInTheDocument();
  });

  it('filtert über die Suche nach Name und BlaulichtSMS-ID', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    await user.type(screen.getByLabelText('Suchen'), '4711');

    expect(screen.getByText('Beispiel Bernd')).toBeInTheDocument();
    expect(screen.queryByText('Muster Anna')).toBeNull();
  });

  it('findet einen Namen auch über Wortanfänge in anderer Reihenfolge', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    await user.type(screen.getByLabelText('Suchen'), 'anna mus');

    expect(screen.getByText('Muster Anna')).toBeInTheDocument();
    expect(screen.queryByText('Beispiel Bernd')).toBeNull();
  });

  it('zeigt die Qualifikationen mit ihren Vorgaben', () => {
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    const annaRow = within(row('Muster Anna'));
    expect(annaRow.getByRole('checkbox', { name: /Kraftfahrer/ })).toBeChecked();
    expect(annaRow.getByRole('checkbox', { name: /Atemschutzträger/ })).not.toBeChecked();

    const berndRow = within(row('Beispiel Bernd'));
    expect(berndRow.getByRole('checkbox', { name: /Kraftfahrer/ })).not.toBeChecked();
    expect(berndRow.getByRole('checkbox', { name: /Atemschutzträger/ })).toBeChecked();
  });

  it('schaltet ein Merkmal direkt in der Liste um', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    await user.click(
      within(row('Muster Anna')).getByRole('checkbox', { name: /Atemschutzträger/ }),
    );

    expect(setPersonFlag).toHaveBeenCalledWith('ffnd', 'p1', 'atemschutztraeger', true);
  });

  it('zeigt die zugeordneten Konten mit Namen', async () => {
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    expect(
      await within(row('Muster Anna')).findByText('anna@example.org'),
    ).toBeInTheDocument();
  });

  it('legt eine Person mit Qualifikationen und Konto an', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    await user.click(screen.getByRole('button', { name: 'Person anlegen' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Name/), 'Neu Norbert');
    await user.click(dialog.getByRole('checkbox', { name: /Atemschutzträger/ }));
    await user.click(dialog.getByLabelText('Benutzerkonten'));
    await user.click(await screen.findByRole('option', { name: /Beispiel Bernd/ }));
    await user.click(dialog.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(saveFahrtenbuchPerson).toHaveBeenCalled());
    expect(vi.mocked(saveFahrtenbuchPerson).mock.calls[0]).toEqual([
      'ffnd',
      undefined,
      expect.objectContaining({
        name: 'Neu Norbert',
        kraftfahrer: true,
        atemschutztraeger: true,
      }),
    ]);
    await waitFor(() =>
      expect(savePersonUserLinks).toHaveBeenCalledWith('ffnd', [
        { personId: 'neu', userIds: ['u2'] },
      ]),
    );
  });

  it('speichert die Konten nicht, wenn sie unverändert sind', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PersonalAdmin groupId="ffnd" groupName="FF Neusiedl" />);

    await user.click(
      within(row('Muster Anna')).getByRole('button', { name: /Person bearbeiten/ }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(saveFahrtenbuchPerson).toHaveBeenCalled());
    expect(savePersonUserLinks).not.toHaveBeenCalled();
  });
});
