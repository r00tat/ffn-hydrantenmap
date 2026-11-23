// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RisikoObjekt } from '../../common/gis-objects';
import type { GroupRoles } from '../../common/permissions';
import { renderWithIntl } from '../../test-utils/intlRender';

const login = vi.hoisted(() => ({
  isAuthorized: true,
  isAdmin: false,
  groupRoles: {} as GroupRoles,
  myGroups: [] as Array<{ id: string; name: string }>,
  homeGroup: undefined as string | undefined,
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({ default: () => login }));

const actions = vi.hoisted(() => ({
  createRisikoObjekt: vi.fn(),
  updateRisikoObjekt: vi.fn(),
  setRisikoObjektGroups: vi.fn(),
  deleteRisikoObjekt: vi.fn(),
}));
vi.mock('./risikoobjektActions', () => actions);
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import RisikoObjektEditDialog from './RisikoObjektEditDialog';

const groupNames = { ffa: 'FF Alpha', ffb: 'FF Beta', ffc: 'FF Gamma' };

const gisObjekt: RisikoObjekt = {
  id: 'g1',
  name: 'Lagerhalle',
  ortschaft: 'ND',
  adresse: 'Industriestraße 1',
  einsatzplanummer: '17',
  erfassungsdatum: '',
  risikogruppe: 'Lager',
  lat: 47.9,
  lng: 16.8,
  groups: ['ffa', 'ffc'],
};

beforeEach(() => {
  vi.clearAllMocks();
  login.isAdmin = false;
  login.groupRoles = { ffa: ['gruppenadmin'], ffb: ['gruppenadmin'], ffc: [] };
  login.myGroups = [
    { id: 'ffa', name: 'FF Alpha' },
    { id: 'ffb', name: 'FF Beta' },
    { id: 'ffc', name: 'FF Gamma' },
  ];
  actions.createRisikoObjekt.mockResolvedValue({ ok: true, id: 'neu' });
  actions.updateRisikoObjekt.mockResolvedValue({ ok: true, id: 'g1' });
  actions.setRisikoObjektGroups.mockResolvedValue({ ok: true, id: 'g1' });
  actions.deleteRisikoObjekt.mockResolvedValue({ ok: true, id: 'a1' });
});

describe('RisikoObjektEditDialog', () => {
  it('legt ein neues Objekt für die gewählte Gruppe an', async () => {
    const onClose = vi.fn();
    renderWithIntl(<RisikoObjektEditDialog open onClose={onClose} groupNames={groupNames} />);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Tankstelle' } });
    fireEvent.change(screen.getByLabelText(/^Breite/), { target: { value: '47,95' } });
    fireEvent.change(screen.getByLabelText(/^Länge/), { target: { value: '16.84' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.createRisikoObjekt).toHaveBeenCalledWith(
      'ffa',
      expect.objectContaining({ name: 'Tankstelle', lat: 47.95, lng: 16.84 }),
    );
  });

  it('zeigt den Fehler der Server Action', async () => {
    actions.createRisikoObjekt.mockResolvedValue({ ok: false, error: 'position' });
    renderWithIntl(<RisikoObjektEditDialog open onClose={vi.fn()} groupNames={groupNames} />);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Tankstelle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Bitte eine gültige Position angeben.')).toBeInTheDocument();
  });

  it('lässt bei GIS-Objekten nur den Link ändern', () => {
    renderWithIntl(
      <RisikoObjektEditDialog open onClose={vi.fn()} objekt={gisObjekt} groupNames={groupNames} />,
    );
    expect(screen.getByLabelText(/^Name/)).toBeDisabled();
    expect(screen.getByLabelText(/^Link zu den Plänen/)).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('ändert die Freigabe nur in eigenen Gruppen', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <RisikoObjektEditDialog open onClose={onClose} objekt={gisObjekt} groupNames={groupNames} />,
    );
    expect(screen.getByRole('checkbox', { name: 'FF Gamma' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'FF Gamma' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'FF Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.updateRisikoObjekt).toHaveBeenCalledWith('g1', expect.any(Object));
    expect(actions.setRisikoObjektGroups).toHaveBeenCalledWith('g1', ['ffa', 'ffb', 'ffc']);
  });

  it('ruft die Freigabe nicht auf, wenn sie gleich bleibt', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <RisikoObjektEditDialog open onClose={onClose} objekt={gisObjekt} groupNames={groupNames} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.setRisikoObjektGroups).not.toHaveBeenCalled();
  });

  it('löscht in der App angelegte Objekte nach Rückfrage', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <RisikoObjektEditDialog
        open
        onClose={onClose}
        objekt={{ ...gisObjekt, id: 'a1', quelle: 'app' }}
        groupNames={groupNames}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(actions.deleteRisikoObjekt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.deleteRisikoObjekt).toHaveBeenCalledWith('a1');
  });
});
