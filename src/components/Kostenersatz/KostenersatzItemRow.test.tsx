// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { KostenersatzLineItem, KostenersatzRate } from '../../common/kostenersatz';
import KostenersatzItemRow from './KostenersatzItemRow';

const personalRate: KostenersatzRate = {
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
};

function item(einheiten: number, anzahlStunden = 2): KostenersatzLineItem {
  return {
    rateId: '1.01',
    einheiten,
    anzahlStunden,
    stundenOverridden: false,
    sum: einheiten * anzahlStunden * personalRate.price,
  };
}

function renderRow(props: Partial<React.ComponentProps<typeof KostenersatzItemRow>> = {}) {
  const onItemChange = vi.fn();
  const result = renderWithIntl(
    <KostenersatzItemRow
      rate={personalRate}
      defaultStunden={2}
      onItemChange={onItemChange}
      {...props}
    />
  );
  return { onItemChange, ...result };
}

const plusButton = () => screen.getByRole('button', { name: 'Anzahl erhöhen' });
const minusButton = () => screen.getByRole('button', { name: 'Anzahl verringern' });
const numberInput = () => screen.getByPlaceholderText('0') as HTMLInputElement;

describe('KostenersatzItemRow', () => {
  it('increments from empty (no item yet) to 1', () => {
    const { onItemChange } = renderRow();

    expect(numberInput().value).toBe('');
    expect(plusButton()).not.toBeDisabled();
    expect(minusButton()).toBeDisabled();

    fireEvent.click(plusButton());

    expect(onItemChange).toHaveBeenCalledWith('1.01', 1, 2, false);
    expect(numberInput().value).toBe('1');
  });

  it('counts up from the displayed value even without a props round trip', () => {
    // The parent normally feeds the new value back through `item`. Without this
    // the row used to recompute 0 + 1 on every click and stayed stuck at 1.
    const { onItemChange } = renderRow();

    fireEvent.click(plusButton());
    fireEvent.click(plusButton());
    fireEvent.click(plusButton());

    expect(onItemChange).toHaveBeenLastCalledWith('1.01', 3, 2, false);
    expect(numberInput().value).toBe('3');
  });

  it('increments an existing item', () => {
    const { onItemChange } = renderRow({ item: item(4) });

    fireEvent.click(plusButton());
    expect(onItemChange).toHaveBeenCalledWith('1.01', 5, 2, false);
  });

  it('decrements down to an empty field', () => {
    const { onItemChange } = renderRow({ item: item(1) });

    fireEvent.click(minusButton());
    expect(onItemChange).toHaveBeenLastCalledWith('1.01', 0, 2, false);
    expect(numberInput().value).toBe('');
    expect(minusButton()).toBeDisabled();
  });

  it('enables the hours field as soon as a unit is added', () => {
    renderRow();
    const hours = screen.getAllByRole('spinbutton').find((el) => el !== numberInput())!;

    expect(hours).toBeDisabled();
    fireEvent.click(plusButton());
    expect(hours).not.toBeDisabled();
  });

  it('picks up einheiten that were changed elsewhere (template, vehicle quick-add)', () => {
    const { onItemChange, rerender } = renderRow();

    expect(numberInput().value).toBe('');

    rerender(
      <KostenersatzItemRow
        rate={personalRate}
        defaultStunden={2}
        onItemChange={onItemChange}
        item={item(7)}
      />
    );

    expect(numberInput().value).toBe('7');

    fireEvent.click(plusButton());
    expect(onItemChange).toHaveBeenLastCalledWith('1.01', 8, 2, false);
  });

  it('picks up hours that were changed elsewhere (Einsatzdauer)', () => {
    const { onItemChange, rerender } = renderRow({ item: item(2, 2) });
    const hours = screen.getAllByRole('spinbutton').find((el) => el !== numberInput())!;

    expect((hours as HTMLInputElement).value).toBe('2');

    rerender(
      <KostenersatzItemRow
        rate={personalRate}
        defaultStunden={5}
        onItemChange={onItemChange}
        item={item(2, 5)}
      />
    );

    expect((hours as HTMLInputElement).value).toBe('5');
  });

  it('keeps typed input untouched while the parent echoes it back', () => {
    const { onItemChange, rerender } = renderRow();

    fireEvent.change(numberInput(), { target: { value: '12' } });
    expect(onItemChange).toHaveBeenLastCalledWith('1.01', 12, 2, false);

    rerender(
      <KostenersatzItemRow
        rate={personalRate}
        defaultStunden={2}
        onItemChange={onItemChange}
        item={item(12)}
      />
    );

    expect(numberInput().value).toBe('12');
  });
});
