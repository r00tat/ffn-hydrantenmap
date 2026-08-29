// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { AtemschutzGeraet } from '../../common/atemschutz';
import FuellungDialog from './FuellungDialog';

function flasche(over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet {
  return {
    id: 'f1',
    typ: 'flasche',
    bezeichnung: 'Atemluftflasche Stahl 6 l',
    feuerwehr: 'Neusiedl am See',
    nummer: '2.16.19',
    nenndruck: 200,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function render(props: Partial<React.ComponentProps<typeof FuellungDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <FuellungDialog
      open
      flaschen={[flasche()]}
      feuerwehren={['Neusiedl am See', 'Jois']}
      personSuggestions={['Max Muster']}
      defaultGefuelltVon="Max Muster"
      onClose={vi.fn()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

describe('FuellungDialog', () => {
  it('setzt 300 bar als Enddruck vor', () => {
    render();
    expect(screen.getByLabelText(/Enddruck/)).toHaveValue(300);
  });

  it('trägt den angemeldeten Benutzer als Füller ein', () => {
    render();
    expect(screen.getByLabelText(/Gefüllt von/)).toHaveValue('Max Muster');
  });

  it('sperrt Speichern ohne Flaschennummer und ohne Feuerwehr', () => {
    render();
    // Beide Felder sind leer — genau der Fall, den validateFuellungInput
    // als `identifierMissing` meldet.
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
    expect(
      screen.getByText(/Flaschennummer oder Feuerwehr/),
    ).toBeInTheDocument();
  });

  it('gibt Speichern frei, sobald eine Feuerwehr eingetragen ist', () => {
    render();
    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'Jois' },
    });
    expect(screen.getByRole('button', { name: /speichern/i })).toBeEnabled();
  });

  it('meldet einen Startdruck über dem Enddruck', () => {
    render();
    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'Jois' },
    });
    fireEvent.change(screen.getByLabelText(/Startdruck/), {
      target: { value: '310' },
    });
    expect(screen.getByText(/Startdruck liegt über/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
  });

  it('übernimmt beim Bearbeiten die gespeicherten Werte', () => {
    render({
      fuellung: {
        id: 'x1',
        anzahl: 5,
        enddruck: 200,
        gefuelltVon: 'Anna Beispiel',
        feuerwehr: 'Jois',
        zeitpunkt: '2026-08-29T10:00:00.000Z',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      },
    });
    expect(screen.getByLabelText(/Anzahl/)).toHaveValue(5);
    expect(screen.getByLabelText(/Enddruck/)).toHaveValue(200);
    expect(screen.getByLabelText(/Gefüllt von/)).toHaveValue('Anna Beispiel');
  });
});
