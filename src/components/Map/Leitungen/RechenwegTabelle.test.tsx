// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RechenSchritt } from '../../FirecallItems/elements/connection/rechenweg';
import { renderWithIntl } from '../../../test-utils/intlRender';
import RechenwegTabelle from './RechenwegTabelle';

/**
 * Geprüft wird, dass jede Zeile ihre drei Auskünfte trägt — Rechnung, Wert und
 * Herkunft. Die Herkunft ist der Grund, dass es die Tabelle gibt: Ohne sie ist
 * ein Planungswert von einem Tabellenwert nicht zu unterscheiden.
 */

const schritt = (overrides: Partial<RechenSchritt> = {}): RechenSchritt => ({
  label: 'stepCycleTime',
  rechnung: '6.0 min + 3.5 min + 3.0 min',
  wert: '12.5',
  einheit: 'min',
  herkunft: 'gerechnet',
  ...overrides,
});

describe('RechenwegTabelle', () => {
  it('zeigt Rechnung, Wert mit Einheit und Herkunft', () => {
    renderWithIntl(<RechenwegTabelle schritte={[schritt()]} />);
    expect(screen.getByText('Umlaufzeit')).toBeInTheDocument();
    expect(
      screen.getByText('6.0 min + 3.5 min + 3.0 min')
    ).toBeInTheDocument();
    expect(screen.getByText('12.5 min')).toBeInTheDocument();
    expect(screen.getByText('gerechnet')).toBeInTheDocument();
  });

  it('macht den Planungswert als solchen kenntlich', () => {
    renderWithIntl(
      <RechenwegTabelle
        schritte={[
          schritt({ label: 'stepEmptyTime', herkunft: 'vorgabe' }),
          schritt({ label: 'stepFrictionHose', herkunft: 'tabelle' }),
        ]}
      />
    );
    expect(screen.getByText('Planungswert')).toBeInTheDocument();
    expect(screen.getByText('Tabelle')).toBeInTheDocument();
  });

  it('setzt einen Gedankenstrich, wo es keinen Wert gibt, und nennt den Grund', () => {
    renderWithIntl(
      <RechenwegTabelle
        schritte={[
          schritt({
            label: 'stepTippingPoint',
            rechnung: undefined,
            wert: undefined,
            einheit: undefined,
            hinweis: 'hintNoValueFillStation',
          }),
        ]}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(
      screen.getByText(/Die Entnahmestelle deckelt unter der geforderten Menge/)
    ).toBeInTheDocument();
  });

  it('zeichnet nichts ohne Schritte', () => {
    const { container } = renderWithIntl(<RechenwegTabelle schritte={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
