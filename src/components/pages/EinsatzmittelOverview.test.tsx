// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { FirecallItem, FirecallLocation } from '../firebase/firestore';

vi.mock('../../hooks/useFirecall', async () => {
  const { createContext } = await import('react');
  return { FirecallContext: createContext({ crewAssignments: [] }) };
});

const { default: EinsatzmittelOverview } = await import('./EinsatzmittelOverview');

const zug = {
  id: 'u1',
  name: '1. Zug',
  type: 'tacticalUnit',
} as unknown as FirecallItem;
const tlf = {
  id: 'v1',
  name: 'TLF',
  fw: 'FF Musterdorf',
  type: 'vehicle',
  besatzung: '5',
  tacticalUnitId: 'u1',
  eintreffen: '2026-10-17T10:00:00Z',
} as unknown as FirecallItem;
const klf = {
  id: 'v2',
  name: 'KLF',
  type: 'vehicle',
  besatzung: '3',
  alarmierung: '2026-10-17T09:50:00Z',
} as unknown as FirecallItem;
const rlf = {
  id: 'v3',
  name: 'RLF',
  type: 'vehicle',
  besatzung: '2',
} as unknown as FirecallItem;

const locations = [
  { id: 'l1', name: 'Keller', street: 'Hauptplatz', number: '1', vehicles: { u1: '1. Zug', v1: 'TLF' } },
  { id: 'l2', name: '', street: 'Seestraße', number: '5', vehicles: { v2: 'KLF' } },
  { id: 'l3', name: 'Leer', street: '', number: '', vehicles: {} },
] as unknown as FirecallLocation[];

function card(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;
}

describe('EinsatzmittelOverview', () => {
  it('gliedert nach Einsatzort mit der Einheit und ihren Fahrzeugen', () => {
    renderWithIntl(
      <EinsatzmittelOverview items={[zug, tlf, klf, rlf]} locations={locations} />,
    );
    const keller = card('Keller');
    expect(within(keller).getByText('1. Zug')).toBeInTheDocument();
    expect(within(keller).getByText('TLF')).toBeInTheDocument();
    expect(within(keller).getByText('eingetroffen')).toBeInTheDocument();
    // Stärke des Einsatzorts aus den Fahrzeugen, die Einheit nicht doppelt
    expect(within(keller).getByText('6 Personen')).toBeInTheDocument();

    expect(within(card('Seestraße 5')).getByText('alarmiert')).toBeInTheDocument();
    expect(within(card('ohne Einsatzort')).getByText('RLF')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Leer' })).not.toBeInTheDocument();
  });
});
