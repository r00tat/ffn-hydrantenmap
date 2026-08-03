// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VEHICLE_PRESETS } from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';
import CounterFields from './CounterFields';

describe('CounterFields', () => {
  it('rendert für den Modus startEnd zwei Felder', () => {
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.fahrzeug}
        counters={{ km: { start: 1000, end: 1042 } }}
        lastCounters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Stand bei Abfahrt/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Stand bei Rückkehr/)).toBeInTheDocument();
  });

  it('zeigt die berechnete Differenz', () => {
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.fahrzeug}
        counters={{ km: { start: 1000, end: 1042 } }}
        lastCounters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/42 km/)).toBeInTheDocument();
  });

  it('rendert für den Modus reading nur ein Feld', () => {
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.boot}
        counters={{}}
        lastCounters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText(/Lenzpumpe Steuerbord.*Abfahrt/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Lenzpumpe Steuerbord/)).toBeInTheDocument();
  });

  it('rendert kein Kilometerfeld für das Boot', () => {
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.boot}
        counters={{}}
        lastCounters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Kilometerstand/)).not.toBeInTheDocument();
  });

  it('zeigt die Warnung bei fallendem Kilometerstand', () => {
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.fahrzeug}
        counters={{ km: { start: 900, end: 950 } }}
        lastCounters={{ km: 1000 }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Letzter bekannter Stand: 1000 km/),
    ).toBeInTheDocument();
  });

  it('zeigt die Warnung bei verändertem Lenzpumpenstand', () => {
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.boot}
        counters={{ lenzpumpeBb: { end: 41 } }}
        lastCounters={{ lenzpumpeBb: 39 }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/vorher 39 h/)).toBeInTheDocument();
  });

  it('blockiert die Eingabe trotz Warnung nicht', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.fahrzeug}
        counters={{ km: { start: 900 } }}
        lastCounters={{ km: 1000 }}
        onChange={onChange}
      />,
    );
    const endField = screen.getByLabelText(/Stand bei Rückkehr/);
    expect(endField).not.toBeDisabled();
    await user.type(endField, '9');
    expect(onChange).toHaveBeenCalledWith({ km: { start: 900, end: 9 } });
  });

  it('meldet einen geleerten Wert als undefined', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.fahrzeug}
        counters={{ km: { start: 1000, end: 1042 } }}
        lastCounters={{}}
        onChange={onChange}
      />,
    );
    await user.clear(screen.getByLabelText(/Stand bei Rückkehr/));
    expect(onChange).toHaveBeenCalledWith({
      km: { start: 1000, end: undefined },
    });
  });

  it('zeigt die Einheit am Feld an', () => {
    renderWithIntl(
      <CounterFields
        definitions={VEHICLE_PRESETS.boot}
        counters={{}}
        lastCounters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText('h').length).toBeGreaterThan(0);
  });

  it('rendert nichts, wenn das Fahrzeug keine Zähler hat', () => {
    const { container } = renderWithIntl(
      <CounterFields
        definitions={[]}
        counters={{}}
        lastCounters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
