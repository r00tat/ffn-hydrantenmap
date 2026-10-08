// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { expiringChargen } from '../../../common/geraetCharge';
import { renderWithIntl } from '../../../test-utils/intlRender';
import ExpiringChargenList from './ExpiringChargenList';

const geraet: Geraet = {
  id: 'g1',
  bezeichnung: 'Ölbindemittel',
  verbrauchsmaterial: true,
  einheit: 'Sack',
  bestandGesamt: 10,
  active: true,
  chargen: [
    { id: 'c1', losNummer: 'A1', ablaufDatum: '2026-09-30', createdAt: '', createdBy: '' },
    { id: 'c2', bezeichnung: 'Lieferung Mai', ablaufDatum: '2026-11-15', createdAt: '', createdBy: '' },
    { id: 'c3', bezeichnung: 'Frisch', ablaufDatum: '2029-01-01', createdAt: '', createdBy: '' },
  ],
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const bestaende: GeraetBestand[] = [
  {
    id: 'b1',
    geraetId: 'g1',
    lagerortKey: 'raum|fwh|lager',
    lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
    anzahl: 10,
    chargen: { c1: 2, c2: 3, c3: 5 },
  },
  {
    id: 'b2',
    geraetId: 'g1',
    lagerortKey: 'fahrzeug|srf|gr 2',
    lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
    anzahl: 1,
    chargen: { c2: 1 },
  },
];

describe('ExpiringChargenList', () => {
  it('zeigt abgelaufene und bald ablaufende Chargen und öffnet den Artikel', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <ExpiringChargenList
        entries={expiringChargen([geraet], bestaende, '2026-10-08')}
        onOpen={onOpen}
      />,
    );
    expect(screen.getAllByText('Ölbindemittel')).toHaveLength(2);
    expect(screen.getByText('Los A1')).toBeInTheDocument();
    expect(screen.getByText('Lieferung Mai')).toBeInTheDocument();
    expect(screen.queryByText('Frisch')).toBeNull();
    expect(screen.getByText('abgelaufen')).toBeInTheDocument();
    expect(screen.getByText('läuft bald ab')).toBeInTheDocument();
    expect(screen.getByText('4 Sack')).toBeInTheDocument();
    expect(screen.getByText(/SRF/)).toBeInTheDocument();
    await user.click(screen.getByText('Los A1'));
    expect(onOpen).toHaveBeenCalledWith('g1');
  });

  it('zeigt nichts, wenn nichts abläuft', () => {
    const { container } = renderWithIntl(<ExpiringChargenList entries={[]} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
