// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { makeAusgabe, sampleData, sampleView } from './bekleidungFixtures';

const { createPersonForBekleidung } = vi.hoisted(() => ({ createPersonForBekleidung: vi.fn() }));
vi.mock('./bekleidungActions', () => ({ createPersonForBekleidung }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import PersonenTab from './PersonenTab';

describe('PersonenTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zeigt aktuelle und frühere Stücke einer Person', async () => {
    const data = sampleData();
    data.ausgaben.push(makeAusgabe({ id: 'a4', stueckId: 's3', groesse: 'XL' }));
    const onReturn = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <PersonenTab view={sampleView(data)} onIssue={vi.fn()} onReturn={onReturn} />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Person wählen' }));
    expect(screen.getByRole('option', { name: 'Erika Mustermann (inaktiv)' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Max Mustermann' }));

    expect(screen.getByText('Einsatzjacke · M · #1002')).toBeInTheDocument();
    expect(screen.getByText('Poloshirt · M · 2 Stk.')).toBeInTheDocument();
    // a2 und a4 ohne Datum
    expect(screen.getAllByText('unbekannt')).toHaveLength(2);
    expect(screen.getByText('privat')).toBeInTheDocument();
    // a3: 1.1.2025 bis 2.3.2025
    expect(screen.getByText(/60 Tage/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    expect(onReturn).toHaveBeenCalledWith('p1');
  });

  it('kennzeichnet private Mengen-Ausgaben aus dem Import', async () => {
    const data = sampleData();
    data.ausgaben = [
      makeAusgabe({ id: 'a9', artikelId: 'polo', groesse: 'L', menge: 1, eigentum: 'privat' }),
    ];
    const user = userEvent.setup();
    renderWithIntl(<PersonenTab view={sampleView(data)} onIssue={vi.fn()} onReturn={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: 'Person wählen' }));
    await user.click(screen.getByRole('option', { name: 'Max Mustermann' }));
    expect(screen.getByText('Poloshirt · L · 1 Stk.')).toBeInTheDocument();
    expect(screen.getByText('privat')).toBeInTheDocument();
  });

  it('legt eine Person an und wählt sie', async () => {
    createPersonForBekleidung.mockResolvedValue({ id: 'p2' });
    const user = userEvent.setup();
    renderWithIntl(<PersonenTab view={sampleView()} onIssue={vi.fn()} onReturn={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Person anlegen' }));
    await user.type(screen.getByRole('textbox', { name: 'Vor- und Nachname' }), 'Erika Musterfrau');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(createPersonForBekleidung).toHaveBeenCalledWith('ffnd', 'Erika Musterfrau');
    expect(screen.getByRole('combobox', { name: 'Person wählen' })).toHaveValue('Erika Musterfrau');
  });
});
