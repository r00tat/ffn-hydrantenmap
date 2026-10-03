// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { Diary } from '../firebase/firestore';
import DiaryTable from './DiaryTable';

const diaries: Diary[] = [
  {
    id: 'd1',
    type: 'diary',
    nummer: 1,
    datum: '2026-03-01T14:20:00',
    von: 'EL',
    an: 'GK',
    name: 'Fahrbahn reinigen',
    beschreibung: 'mit Bindemittel',
    erledigt: '2026-03-01T14:40:00',
  },
  {
    id: 'd2',
    type: 'diary',
    nummer: 2,
    datum: '2026-03-01T14:30:00',
    name: 'Lagemeldung',
  },
];

describe('DiaryTable', () => {
  it('kommt mit vier Spalten aus', () => {
    renderWithIntl(<DiaryTable diaries={diaries} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
    expect(
      screen.getByRole('columnheader', { name: 'Von / An' })
    ).toBeInTheDocument();
  });

  it('setzt den Titel fett und die Beschreibung darunter', () => {
    renderWithIntl(<DiaryTable diaries={diaries} />);
    const title = screen.getByText('Fahrbahn reinigen');
    expect(title.tagName).toBe('STRONG');
    const cell = title.closest('td')!;
    expect(within(cell).getByText('mit Bindemittel')).toBeInTheDocument();
  });

  it('fasst Von und An in einer Zelle zusammen', () => {
    renderWithIntl(<DiaryTable diaries={diaries} />);
    const row = screen.getByText('Fahrbahn reinigen').closest('tr')!;
    expect(within(row).getByText('EL → GK')).toBeInTheDocument();
  });

  it('vermerkt erledigte Einträge beim Text', () => {
    renderWithIntl(<DiaryTable diaries={diaries} />);
    const done = screen.getByText(/erledigt 01\.03\.2026 14:40/);
    expect(done.closest('td')).toBe(
      screen.getByText('Fahrbahn reinigen').closest('td')
    );
    const open = screen.getByText('Lagemeldung').closest('td')!;
    expect(within(open).queryByText(/erledigt/)).toBeNull();
  });

  it('formatiert die Zeit ohne Sekunden', () => {
    renderWithIntl(<DiaryTable diaries={diaries} />);
    expect(screen.getByText('01.03.2026 14:20')).toBeInTheDocument();
  });
});
