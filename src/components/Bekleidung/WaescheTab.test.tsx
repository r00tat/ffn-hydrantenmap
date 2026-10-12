// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';
import WaescheTab from './WaescheTab';

describe('WaescheTab', () => {
  it('listet Waschgänge mit Programm und Stücken', () => {
    renderWithIntl(<WaescheTab view={sampleView()} />);
    expect(screen.getByText(/Imprägnierung · 1 Stück/)).toBeInTheDocument();
    expect(screen.getByText('Einsatzjacke · L · #1001')).toBeInTheDocument();
  });

  it('meldet eine leere Liste', () => {
    renderWithIntl(<WaescheTab view={sampleView({ waeschen: [] })} />);
    expect(screen.getByText('Noch keine Wäsche erfasst.')).toBeInTheDocument();
  });
});
