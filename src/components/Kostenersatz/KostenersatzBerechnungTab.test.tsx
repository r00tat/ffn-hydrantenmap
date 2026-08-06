// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCallback, useState } from 'react';
import { renderWithIntl } from '../../test-utils/intlRender';
import {
  calculateItemSum,
  calculateSubtotals,
  calculateTotalSum,
  KostenersatzCalculation,
  KostenersatzCustomItem,
  KostenersatzLineItem,
  KostenersatzRate,
} from '../../common/kostenersatz';
import KostenersatzBerechnungTab from './KostenersatzBerechnungTab';

vi.mock('../../hooks/useKostenersatzVehicles', () => ({
  useKostenersatzVehicles: () => ({ vehicles: [], vehiclesById: new Map(), loading: false }),
}));

const rates: KostenersatzRate[] = [
  {
    id: '1.01',
    category: 'A',
    categoryNumber: 1,
    categoryName: 'Mannschaft und Fahrtkostenersatz',
    description: 'Personalaufwand (Einsatz, Bereitschaftsdienste, usw.)',
    unit: 'pro Person & h',
    price: 32.4,
    isExtendable: false,
    sortOrder: 101,
    version: 'LGBl_77_2023',
    validFrom: '2023-11-07',
  },
];
const ratesById = new Map(rates.map((r) => [r.id, r]));

const emptyCalculation: KostenersatzCalculation = {
  firecallId: 'firecall-1',
  status: 'draft',
  defaultStunden: 2,
  items: [],
  customItems: [],
  subtotals: {},
  totalSum: 0,
  recipient: { name: '' },
  rateVersion: 'LGBl_77_2023',
  createdBy: 'test@example.com',
  createdAt: '2026-08-05T10:00:00.000Z',
} as unknown as KostenersatzCalculation;

/**
 * Stateful harness that stores the changes the row reports, mirroring how
 * KostenersatzCalculationPage / KostenersatzDialog keep the calculation state.
 */
function Harness({ initial = emptyCalculation }: { initial?: KostenersatzCalculation }) {
  const [calculation, setCalculation] = useState<KostenersatzCalculation>(initial);

  const handleItemChange = useCallback(
    (rateId: string, einheiten: number, stunden: number, stundenOverridden: boolean) => {
      const rate = ratesById.get(rateId);
      if (!rate) return;
      const sum = calculateItemSum(
        stunden,
        einheiten,
        rate.price,
        rate.pricePauschal,
        rate.pauschalHours
      );
      setCalculation((prev) => {
        const items = prev.items.filter((i) => i.rateId !== rateId);
        if (einheiten > 0) {
          items.push({
            rateId,
            einheiten,
            anzahlStunden: stunden,
            stundenOverridden,
            sum,
          } as KostenersatzLineItem);
        }
        return {
          ...prev,
          items,
          subtotals: calculateSubtotals(items, rates),
          totalSum: calculateTotalSum(items, prev.customItems),
        };
      });
    },
    []
  );

  const handleCustomItemChange = useCallback(
    (index: number, item: KostenersatzCustomItem | null) => {
      setCalculation((prev) => {
        const customItems = [...prev.customItems];
        if (item === null) customItems.splice(index, 1);
        else if (index >= customItems.length) customItems.push(item);
        else customItems[index] = item;
        return { ...prev, customItems };
      });
    },
    []
  );

  return (
    <KostenersatzBerechnungTab
      calculation={calculation}
      rates={rates}
      ratesById={ratesById}
      onItemChange={handleItemChange}
      onCustomItemChange={handleCustomItemChange}
    />
  );
}

function personalRow(): HTMLElement {
  return screen.getByText(/Personalaufwand/).closest('div')!.parentElement as HTMLElement;
}

describe('Kostenersatz Berechnung – Anzahl +/- for a row without a value', () => {
  it('adds the first unit when + is pressed on an empty Personal row', () => {
    renderWithIntl(<Harness />);

    const row = personalRow();
    const input = within(row).getByPlaceholderText('0') as HTMLInputElement;
    expect(input.value).toBe('');

    const minus = within(row).getByRole('button', { name: 'Anzahl verringern' });
    const plus = within(row).getByRole('button', { name: 'Anzahl erhöhen' });
    expect(minus).toBeDisabled();
    expect(plus).not.toBeDisabled();

    fireEvent.click(plus);

    expect(input.value).toBe('1');
    // 1 Person × 2 h × 32,40 € = 64,80 €
    expect(within(row).getByText(/64,80/)).toBeTruthy();
    expect(minus).not.toBeDisabled();
  });

  it('counts up on repeated + presses and back down on -', () => {
    renderWithIntl(<Harness />);

    const row = personalRow();
    const input = within(row).getByPlaceholderText('0') as HTMLInputElement;
    const minus = within(row).getByRole('button', { name: 'Anzahl verringern' });
    const plus = within(row).getByRole('button', { name: 'Anzahl erhöhen' });

    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(input.value).toBe('3');

    fireEvent.click(minus);
    fireEvent.click(minus);
    expect(input.value).toBe('1');

    fireEvent.click(minus);
    expect(input.value).toBe('');
    expect(minus).toBeDisabled();
  });

  it('enables the Stunden input as soon as the first unit is added', () => {
    renderWithIntl(<Harness />);

    const row = personalRow();
    const plus = within(row).getByRole('button', { name: 'Anzahl erhöhen' });
    const hoursInput = within(row)
      .getAllByRole('spinbutton')
      .find((el) => el !== within(row).getByPlaceholderText('0')) as HTMLInputElement;

    expect(hoursInput).toBeDisabled();
    fireEvent.click(plus);
    expect(hoursInput).not.toBeDisabled();
  });
});
