// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { AtemschutzGeraet } from '../../common/atemschutz';
import GeraetAutocomplete from './GeraetAutocomplete';

function geraet(over: Partial<AtemschutzGeraet>): AtemschutzGeraet {
  return {
    typ: 'flasche',
    bezeichnung: 'Atemluftflasche Stahl 6 l',
    feuerwehr: 'Neusiedl am See',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

const GERAETE = [
  geraet({ id: 'a', nummer: '2.16.19', seriennummer: 'BA66937' }),
  geraet({ id: 'b', nummer: '2.11.03', feuerwehr: 'Jois' }),
];

describe('GeraetAutocomplete', () => {
  it('schlägt über einen Teil der Flaschennummer vor', () => {
    renderWithIntl(
      <GeraetAutocomplete
        label="Flasche"
        value="2.16"
        geraete={GERAETE}
        onTextChange={vi.fn()}
        onGeraetChange={vi.fn()}
      />,
    );
    fireEvent.focus(screen.getByLabelText('Flasche'));
    fireEvent.keyDown(screen.getByLabelText('Flasche'), { key: 'ArrowDown' });
    expect(screen.getByText(/2\.16\.19/)).toBeInTheDocument();
    expect(screen.queryByText(/2\.11\.03/)).not.toBeInTheDocument();
  });

  it('schlägt über die Feuerwehr vor', () => {
    renderWithIntl(
      <GeraetAutocomplete
        label="Flasche"
        value="Jois"
        geraete={GERAETE}
        onTextChange={vi.fn()}
        onGeraetChange={vi.fn()}
      />,
    );
    fireEvent.focus(screen.getByLabelText('Flasche'));
    fireEvent.keyDown(screen.getByLabelText('Flasche'), { key: 'ArrowDown' });
    expect(screen.getByText(/2\.11\.03/)).toBeInTheDocument();
  });

  it('reicht freie Eingabe durch, zu der es kein Gerät gibt', () => {
    const onTextChange = vi.fn();
    renderWithIntl(
      <GeraetAutocomplete
        label="Flasche"
        value=""
        geraete={GERAETE}
        onTextChange={onTextChange}
        onGeraetChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Flasche'), {
      target: { value: 'Fremdflasche 7' },
    });
    expect(onTextChange).toHaveBeenCalledWith('Fremdflasche 7');
  });
});
