// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand, GeraetSet } from '../../../common/geraet';
import { renderWithIntl as render } from '../../../test-utils/intlRender';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({
  saveGeraetSet: mocks.save,
  deleteGeraetSet: mocks.remove,
}));
vi.mock('../../../hooks/useOnline', () => ({ default: () => true }));
// Die Kamera gibt es im Test nicht: Der Scan liefert einen festen Code.
vi.mock('../einsatz/GeraetScanDialog', () => ({
  default: ({ open, onCode }: { open: boolean; onCode: (code: string) => void }) =>
    open ? <button onClick={() => onCode('QR-OEL')}>Scan liefern</button> : null,
}));

import GeraetSetDialog from './GeraetSetDialog';

function geraet(overrides: Partial<Geraet>): Geraet {
  return {
    id: 'g',
    bezeichnung: 'Artikel',
    verbrauchsmaterial: false,
    bestandGesamt: 0,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const besen = geraet({ id: 'besen', bezeichnung: 'Besen' });
const binder = geraet({
  id: 'binder',
  bezeichnung: 'Ölbindemittel',
  verbrauchsmaterial: true,
  einheit: 'Sack',
});
const pumpe = geraet({ id: 'pumpe', bezeichnung: 'Tauchpumpe', barcodes: ['ABC123'] });
const kiste = geraet({
  id: 'kiste',
  bezeichnung: 'Ölspur-Kiste',
  materialTyp: 'Set-Artikel',
  barcodes: ['SET-1'],
});
const geraete = [besen, binder, pumpe, kiste];

const lager: GeraetBestand = {
  id: 'lager',
  geraetId: 'binder',
  lagerortKey: 'raum|feuerwehrhaus|lager',
  lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
  anzahl: 40,
};
const bestaendeByGeraet = new Map([['binder', [lager]]]);

const oelspur: GeraetSet = {
  id: 'oelspur',
  name: 'Ölspur',
  codes: ['OEL'],
  inhalt: [{ geraetId: 'besen' }, { geraetId: 'binder', menge: 3 }],
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

function renderDialog(props: { set?: GeraetSet } = {}) {
  const onClose = vi.fn();
  render(
    <GeraetSetDialog
      open
      groupId="ffnd"
      geraete={geraete}
      bestaendeByGeraet={bestaendeByGeraet}
      sets={[oelspur]}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose };
}

async function addItems(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  const input = screen.getByRole('combobox', { name: 'Inhalt hinzufügen' });
  for (const name of names) {
    await user.click(input);
    await user.clear(input);
    await user.type(input, name);
    await user.click(await screen.findByRole('option', { name: new RegExp(name) }));
  }
}

function row(name: string) {
  return screen.getByRole('listitem', { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ id: 'new' });
  mocks.remove.mockResolvedValue({ id: 'oelspur' });
});

describe('GeraetSetDialog', () => {
  it('legt ein Set mit Name, Inhalten und Menge an', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Hochwasser');
    await addItems(user, 'Besen', 'Ölbinde');
    const menge = within(row('Ölbindemittel')).getByRole('textbox', { name: 'Menge (Sack)' });
    await user.clear(menge);
    await user.type(menge, '2,5');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mocks.save).toHaveBeenCalledWith('ffnd', {
      name: 'Hochwasser',
      codes: [],
      inhalt: [{ geraetId: 'besen', menge: 1 }, { geraetId: 'binder', menge: 2.5 }],
      active: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('zeigt den Lagerort nur bei Verbrauchsmaterial und speichert ihn', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Hochwasser');
    await addItems(user, 'Besen', 'Ölbinde');
    expect(within(row('Besen')).queryByRole('combobox', { name: 'Lagerort' })).toBeNull();
    await user.click(within(row('Ölbindemittel')).getByRole('combobox', { name: 'Lagerort' }));
    await user.click(await screen.findByRole('option', { name: /Feuerwehrhaus · Lager/ }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mocks.save.mock.calls[0][1].inhalt[1]).toEqual({
      geraetId: 'binder',
      menge: 1,
      bestandId: 'lager',
    });
  });

  it('bietet nur Set-Artikel zur Bindung an und zeigt deren Codes schreibgeschützt', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Sybos-Set-Artikel' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Ölspur-Kiste']);
    await user.click(options[0]);
    expect(screen.getByText('Codes des Set-Artikels – gelten automatisch')).toBeInTheDocument();
    expect(screen.getByText('SET-1')).toBeInTheDocument();
  });

  it('übernimmt einen gescannten und einen getippten Code', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Hochwasser');
    await addItems(user, 'Besen');
    await user.click(screen.getByRole('button', { name: 'Code scannen' }));
    await user.click(screen.getByRole('button', { name: 'Scan liefern', hidden: true }));
    await user.type(screen.getByRole('combobox', { name: 'Codes' }), 'HW-1{Enter}');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mocks.save.mock.calls[0][1].codes).toEqual(['QR-OEL', 'HW-1']);
  });

  it('meldet Fehler am Feld und ruft die Action nicht', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByRole('combobox', { name: 'Codes' }), 'abc123{Enter}');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte einen Namen angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte mindestens einen Inhalt wählen.')).toBeInTheDocument();
    expect(
      screen.getByText('Der Code „abc123“ gehört schon zum Artikel „Tauchpumpe“.'),
    ).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('meldet eine ungültige Menge an der Zeile', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Hochwasser');
    await addItems(user, 'Besen');
    const menge = within(row('Besen')).getByRole('textbox', { name: 'Menge' });
    await user.clear(menge);
    await user.type(menge, 'abc');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(within(row('Besen')).getByText('Bitte eine Menge größer 0 angeben.')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('verschiebt und entfernt Zeilen', async () => {
    const user = userEvent.setup();
    renderDialog({ set: oelspur });
    await user.click(within(row('Ölbindemittel')).getByRole('button', { name: 'Nach oben' }));
    await user.click(within(row('Besen')).getByRole('button', { name: 'Entfernen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mocks.save).toHaveBeenCalledWith('ffnd', {
      id: 'oelspur',
      name: 'Ölspur',
      codes: ['OEL'],
      inhalt: [{ geraetId: 'binder', menge: 3 }],
      active: true,
    });
  });

  it('zeigt einen Serverfehler und bleibt offen', async () => {
    mocks.save.mockRejectedValue(new Error('invalid geraetSet: codeCollision'));
    const user = userEvent.setup();
    const { onClose } = renderDialog({ set: oelspur });
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Speichern fehlgeschlagen: invalid geraetSet: codeCollision'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('löscht nach Rückfrage', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ set: oelspur });
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    const confirm = await screen.findByRole('dialog', { name: 'Set löschen?' });
    await user.click(within(confirm).getByRole('button', { name: 'Löschen' }));
    expect(mocks.remove).toHaveBeenCalledWith('ffnd', 'oelspur');
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
