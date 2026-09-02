// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { berechneStand } from '../../common/atemschutzUeberwachung';
import { renderWithIntl } from '../../test-utils/intlRender';
import DruckVerlaufChart from './DruckVerlaufChart';

const ABMARSCH = '2026-09-02T10:00:00.000Z';
const nachAbmarsch = (minuten: number) =>
  new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  feuerwehr: 'Neusiedl am See',
  mitglieder: ['Huber'],
  status: 'imEinsatz',
  bereitSeit: ABMARSCH,
  abmarschZeit: ABMARSCH,
  druckAbmarsch: 300,
  paTyp: 'standard300',
  abfragen: [
    { zeitpunkt: nachAbmarsch(5).toISOString(), druck: 240, amZiel: true },
  ],
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

function render(t: AtemschutzTrupp, minuten: number) {
  const jetzt = nachAbmarsch(minuten);
  const stand = berechneStand(t, jetzt)!;
  renderWithIntl(<DruckVerlaufChart trupp={t} stand={stand} jetzt={jetzt} />);
}

describe('DruckVerlaufChart', () => {
  it('zeichnet Marken und Schwellen', () => {
    render(trupp, 10);
    expect(
      screen.getByRole('img', { name: 'Druckverlauf über die Zeit' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('rechn. Ende')).toBeInTheDocument();
    expect(screen.getByText('jetzt')).toBeInTheDocument();
    // 300 → 240 am Ziel: doppelter Vormarschdruckabfall 120 bar.
    expect(screen.getByText('Rückzug 120 bar')).toBeInTheDocument();
    expect(screen.getByText('Reserve 55 bar')).toBeInTheDocument();
  });

  it('zeichnet nichts, solange es nur den Abmarsch gibt', () => {
    render({ ...trupp, abfragen: [] }, 3);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
