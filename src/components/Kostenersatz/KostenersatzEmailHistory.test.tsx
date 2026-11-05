// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../test-utils/intlRender';
import KostenersatzEmailHistory from './KostenersatzEmailHistory';

describe('KostenersatzEmailHistory', () => {
  it('sagt, dass noch nicht versandt wurde', () => {
    renderWithIntl(<KostenersatzEmailHistory entries={[]} />);
    expect(screen.getByText('Noch nicht per E-Mail versandt.')).toBeInTheDocument();
  });

  it('zeigt jeden Versand mit Empfänger, Kopie und Bearbeiter sowie die Anzahl', () => {
    renderWithIntl(
      <KostenersatzEmailHistory
        entries={[
          {
            sentAt: '2026-11-01T10:00:00.000Z',
            to: 'erst@example.com',
            sentBy: 'bearbeiter@example.com',
          },
          {
            sentAt: '2026-11-03T10:00:00.000Z',
            to: 'zweit@example.com',
            cc: ['kopie@example.com'],
          },
        ]}
      />,
    );

    expect(screen.getByText('Versand (2×)')).toBeInTheDocument();
    expect(screen.getByText(/erst@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/zweit@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/CC: kopie@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/von bearbeiter@example\.com/)).toBeInTheDocument();
  });

  it('kennzeichnet einen alten Versand ohne protokollierten Empfänger', () => {
    renderWithIntl(
      <KostenersatzEmailHistory entries={[{ sentAt: '2026-01-01T10:00:00.000Z', to: '' }]} />,
    );
    expect(screen.getByText(/Empfänger nicht protokolliert/)).toBeInTheDocument();
  });
});
