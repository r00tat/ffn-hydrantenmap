// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { FirecallItem } from '../firebase/firestore';

// Der Einsatz-Kontext hängt an Firestore; hier zählt nur, dass keine
// Besatzungszuordnung dazwischenkommt — die Stärke steht an den Fahrzeugen.
vi.mock('../../hooks/useFirecall', async () => {
  const { createContext } = await import('react');
  return { FirecallContext: createContext({ crewAssignments: [] }) };
});

const { default: StrengthTable } = await import('./StrengthTable');

const TLF = {
  name: 'TLF',
  fw: 'FF Neusiedl',
  type: 'vehicle',
  besatzung: '5',
  ats: 2,
} as unknown as FirecallItem;

const RTW = {
  name: 'RTW',
  fw: 'Rotes Kreuz',
  type: 'vehicle',
  besatzung: '1',
  fremd: 'true',
} as unknown as FirecallItem;

/** Die Zeile, in deren erster Zelle `label` steht. */
function totalRow(label: string): HTMLElement {
  const cell = screen.getByText(label);
  return cell.closest('tr') as HTMLElement;
}

describe('StrengthTable', () => {
  it('zeigt ohne Fremdkräfte nur eine Gesamtzeile', () => {
    // Der Normalfall bleibt, wie er war — kein leerer Abschnitt „Fremdkräfte"
    // an jedem Einsatz, an dem nur die eigene Wehr ausgerückt ist.
    renderWithIntl(<StrengthTable items={[TLF]} />);
    expect(screen.getByText('Gesamt')).toBeInTheDocument();
    expect(screen.queryByText('Eigene Kräfte')).not.toBeInTheDocument();
    expect(screen.queryByText('Fremdkräfte')).not.toBeInTheDocument();
  });

  it('trennt eigene Kräfte und Fremdkräfte in eigene Abschnitte', () => {
    renderWithIntl(<StrengthTable items={[TLF, RTW]} />);
    expect(screen.getByText('Eigene Kräfte')).toBeInTheDocument();
    expect(screen.getByText('Fremdkräfte')).toBeInTheDocument();
  });

  it('summiert je Abschnitt getrennt und darunter gesamt', () => {
    renderWithIntl(<StrengthTable items={[TLF, RTW]} />);
    expect(within(totalRow('Summe eigene Kräfte')).getByText('6')).toBeInTheDocument();
    expect(within(totalRow('Summe Fremdkräfte')).getByText('2')).toBeInTheDocument();
    expect(within(totalRow('Gesamt')).getByText('8')).toBeInTheDocument();
  });

  it('stellt die eigenen Kräfte voran', () => {
    renderWithIntl(<StrengthTable items={[RTW, TLF]} />);
    const text = document.body.textContent || '';
    expect(text.indexOf('Eigene Kräfte')).toBeLessThan(
      text.indexOf('Fremdkräfte')
    );
    expect(text.indexOf('TLF')).toBeLessThan(text.indexOf('RTW'));
  });
});
