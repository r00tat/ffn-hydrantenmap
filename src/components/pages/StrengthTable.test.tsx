// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { FirecallItem } from '../firebase/firestore';

// Der Einsatz-Kontext hängt an Firestore; hier zählt nur, dass keine
// Besatzungszuordnung dazwischenkommt — die Stärke steht an den Fahrzeugen.
vi.mock('../../hooks/useFirecall', async () => {
  const { createContext } = await import('react');
  return { FirecallContext: createContext({ crewAssignments: [] }) };
});

const updateLocation = vi.fn();
const locations = [
  {
    id: 'l1',
    name: 'Keller Hauptplatz',
    street: 'Hauptplatz',
    number: '1',
    vehicles: { v1: 'TLF' },
  },
  { id: 'l2', name: '', street: 'Seestraße', number: '5', vehicles: {} },
];
vi.mock('../../hooks/useFirecallLocations', () => ({
  default: () => ({ locations, updateLocation }),
}));
const addDiaryEntry = vi.fn();
vi.mock('../Einsatzorte/useLocationDiary', () => ({
  default: () => addDiaryEntry,
}));
const saveHistory = vi.fn();
vi.mock('../../hooks/firecallHistory/useSaveHistory', () => ({
  useSaveHistory: () => ({ saveHistory, saveInProgress: false }),
}));
vi.mock('../FirecallItems/FirecallItemUpdateDialog', () => ({
  default: ({ item }: { item: FirecallItem }) => (
    <div role="dialog">Dialog {item.name}</div>
  ),
}));

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

describe('StrengthTable — bearbeitbar', () => {
  const TLF_WITH_ID = { ...TLF, id: 'v1' } as FirecallItem;
  const ZUG = {
    id: 'u1',
    name: '1. Zug',
    type: 'tacticalUnit',
    mann: 9,
  } as unknown as FirecallItem;

  beforeEach(() => {
    updateLocation.mockReset();
    addDiaryEntry.mockReset();
    saveHistory.mockReset();
  });

  it('zeigt ohne editable weder Einsatzort noch Bearbeiten', () => {
    renderWithIntl(<StrengthTable items={[TLF_WITH_ID]} />);
    expect(screen.queryByText('Einsatzort')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'TLF bearbeiten' }),
    ).not.toBeInTheDocument();
  });

  it('zeigt den zugeordneten Einsatzort und ordnet eine Einheit zu', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StrengthTable items={[TLF_WITH_ID, ZUG]} editable />);

    expect(screen.getByText('Keller Hauptplatz')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Einsatzort von 1. Zug' }));
    await user.click(screen.getByRole('option', { name: 'Seestraße 5' }));

    expect(saveHistory).toHaveBeenCalledWith(
      'Status vor 1. Zug zu Einsatzort Seestraße 5 zugeordnet',
    );
    expect(updateLocation).toHaveBeenCalledWith('l2', {
      vehicles: { u1: '1. Zug' },
    });
    expect(addDiaryEntry).toHaveBeenCalledWith(
      '1. Zug zu Einsatzort Seestraße 5 zugeordnet',
    );
    // Nach der Auswahl schließt das Menü.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('wechselt den Einsatzort: abziehen vom alten, zuordnen zum neuen', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StrengthTable items={[TLF_WITH_ID]} editable />);

    await user.click(screen.getByRole('combobox', { name: 'Einsatzort von TLF' }));
    await user.click(screen.getByRole('option', { name: 'Seestraße 5' }));

    expect(updateLocation).toHaveBeenCalledWith('l1', { vehicles: {} });
    expect(updateLocation).toHaveBeenCalledWith('l2', { vehicles: { v1: 'TLF' } });
    expect(addDiaryEntry.mock.calls.map((c) => c[0])).toEqual([
      'TLF von Einsatzort Keller Hauptplatz abgezogen',
      'TLF zu Einsatzort Seestraße 5 zugeordnet',
    ]);
  });

  it('zieht mit „kein Einsatzort" ab', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StrengthTable items={[TLF_WITH_ID]} editable />);

    await user.click(screen.getByRole('combobox', { name: 'Einsatzort von TLF' }));
    await user.click(screen.getByRole('option', { name: 'kein Einsatzort' }));

    expect(updateLocation).toHaveBeenCalledWith('l1', { vehicles: {} });
    expect(addDiaryEntry).toHaveBeenCalledWith(
      'TLF von Einsatzort Keller Hauptplatz abgezogen',
    );
  });

  it('öffnet den Bearbeiten-Dialog der Zeile', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StrengthTable items={[TLF_WITH_ID, ZUG]} editable />);
    await user.click(screen.getByRole('button', { name: '1. Zug bearbeiten' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Dialog 1. Zug');
  });
});
