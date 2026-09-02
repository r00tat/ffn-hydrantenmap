// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp, TruppGeraet } from '../../common/atemschutz';
import { renderWithIntl } from '../../test-utils/intlRender';
import TruppGeraeteDialog from './TruppGeraeteDialog';

const flasche: TruppGeraet = {
  typ: 'flasche',
  bezeichnung: 'Flasche 1',
  kennung: 'F-1',
};

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    truppName: 'Trupp 1',
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna Beispiel', 'Bert Beispiel'],
    status: 'imEinsatz',
    bereitSeit: '2026-09-02T10:00:00.000Z',
    truppGeraete: [flasche],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function render(t: AtemschutzTrupp = trupp()) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <TruppGeraeteDialog
      open
      trupp={t}
      geraete={[]}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

const traegerFeld = () =>
  screen.getByRole('combobox', { name: /Getragen von/ });

describe('TruppGeraeteDialog', () => {
  it('bietet als Träger nur die Truppmitglieder an', async () => {
    // Ein Gerät trägt jemand aus diesem Trupp — jede andere Person der Gruppe
    // wäre hier eine Fehlerquelle und keine Hilfe.
    render();
    await userEvent.click(traegerFeld());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'nicht zugeordnet',
      'Anna Beispiel',
      'Bert Beispiel',
    ]);
  });

  it('schreibt die gewählte Person ans Gerät', async () => {
    const onSave = render();
    await userEvent.click(traegerFeld());
    await userEvent.click(screen.getByRole('option', { name: 'Bert Beispiel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual([
      { ...flasche, person: 'Bert Beispiel' },
    ]);
  });

  it('lässt die Zuordnung wieder los', async () => {
    // „nicht zugeordnet" muss wählbar bleiben: Die Zuordnung ist freiwillig.
    const onSave = render(
      trupp({ truppGeraete: [{ ...flasche, person: 'Anna Beispiel' }] }),
    );
    await userEvent.click(traegerFeld());
    await userEvent.click(
      screen.getByRole('option', { name: 'nicht zugeordnet' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual([flasche]);
  });

  it('behält einen Namen, der nicht mehr im Trupp steht', async () => {
    // Sonst verschwände eine bereits erfasste Zuordnung stillschweigend,
    // sobald jemand die Mitgliederliste des Trupps ändert.
    render(trupp({ truppGeraete: [{ ...flasche, person: 'Dora Ehemals' }] }));
    expect(traegerFeld()).toHaveTextContent('Dora Ehemals');
    await userEvent.click(traegerFeld());
    expect(
      screen.getByRole('option', { name: 'Dora Ehemals' }),
    ).toBeInTheDocument();
  });
});
