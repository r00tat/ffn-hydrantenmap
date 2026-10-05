// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetSet } from '../../../common/geraet';
import { renderWithIntl as render } from '../../../test-utils/intlRender';

vi.mock('../../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('./GeraetSetDialog', () => ({
  default: ({ set }: { set?: GeraetSet }) => (
    <div role="dialog">{set ? `Dialog ${set.name}` : 'Dialog neu'}</div>
  ),
}));

import GeraetSetsTab from './GeraetSetsTab';

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

function set(overrides: Partial<GeraetSet>): GeraetSet {
  return {
    id: 's',
    name: 'Set',
    codes: [],
    inhalt: [],
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const kiste = geraet({ id: 'kiste', bezeichnung: 'Ölspur-Kiste', materialTyp: 'Set-Artikel' });
const oelspur = set({
  id: 'oelspur',
  name: 'Ölspur',
  sybosSetArtikelId: 'kiste',
  codes: ['OEL'],
  inhalt: [{ geraetId: 'a' }, { geraetId: 'b' }, { geraetId: 'c' }],
});
const hochwasser = set({
  id: 'hochwasser',
  name: 'Hochwasser',
  codes: ['HW-1'],
  inhalt: [{ geraetId: 'a' }],
  active: false,
});

function renderTab(canManage: boolean) {
  render(
    <GeraetSetsTab
      groupId="ffnd"
      canManage={canManage}
      geraete={[kiste]}
      bestaendeByGeraet={new Map()}
      sets={[hochwasser, oelspur]}
    />,
  );
}

describe('GeraetSetsTab', () => {
  it('listet Name, Inhalte, Codes, Sybos-Bindung und inaktive Sets', () => {
    renderTab(false);
    expect(screen.getByText('Ölspur')).toBeInTheDocument();
    expect(screen.getByText('3 Inhalte · OEL')).toBeInTheDocument();
    expect(screen.getByText('Sybos: Ölspur-Kiste')).toBeInTheDocument();
    expect(screen.getByText('1 Inhalt · HW-1')).toBeInTheDocument();
    expect(screen.getByText('inaktiv')).toBeInTheDocument();
  });

  it('sucht über Name und Code', async () => {
    const user = userEvent.setup();
    renderTab(false);
    await user.type(screen.getByRole('searchbox', { name: 'Suche (Name, Code)' }), 'hw-1');
    expect(screen.queryByText('Ölspur')).toBeNull();
    expect(screen.getByText('Hochwasser')).toBeInTheDocument();
  });

  it('zeigt „Neues Set" und den Dialog nur mit Pflegerecht', async () => {
    const user = userEvent.setup();
    renderTab(false);
    expect(screen.queryByRole('button', { name: 'Neues Set' })).toBeNull();
    await user.click(screen.getByText('Ölspur'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('öffnet den Dialog zum Anlegen und Ändern', async () => {
    const user = userEvent.setup();
    renderTab(true);
    await user.click(screen.getByRole('button', { name: 'Neues Set' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Dialog neu');
  });

  it('öffnet ein bestehendes Set', async () => {
    const user = userEvent.setup();
    renderTab(true);
    await user.click(screen.getByText('Ölspur'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Dialog Ölspur');
  });

  it('meldet eine leere Liste', () => {
    render(
      <GeraetSetsTab
        groupId="ffnd"
        canManage
        geraete={[]}
        bestaendeByGeraet={new Map()}
        sets={[]}
      />,
    );
    expect(screen.getByText('Keine Sets angelegt.')).toBeInTheDocument();
  });
});
