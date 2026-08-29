// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import PersonChipsInput from './PersonChipsInput';

const OPTIONS = ['Anna Huber', 'Bernd Maier'];

describe('PersonChipsInput', () => {
  it('macht aus einer Eingabe mit Enter einen Namen', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <PersonChipsInput
        label="Füllpersonal"
        value={[]}
        options={OPTIONS}
        onChange={onChange}
      />,
    );
    const feld = screen.getByLabelText('Füllpersonal');
    fireEvent.change(feld, { target: { value: 'Christian Vogel' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['Christian Vogel']);
  });

  it('übernimmt den offenen Text auch beim Verlassen des Feldes', () => {
    // Der eigentliche Grund für `autoSelect`: Wer den letzten Namen tippt und
    // gleich auf „Speichern" klickt, darf ihn nicht verlieren.
    const onChange = vi.fn();
    renderWithIntl(
      <PersonChipsInput
        label="Füllpersonal"
        value={[]}
        options={OPTIONS}
        onChange={onChange}
      />,
    );
    const feld = screen.getByLabelText('Füllpersonal');
    fireEvent.change(feld, { target: { value: 'Doris Klein' } });
    fireEvent.blur(feld);
    expect(onChange).toHaveBeenCalledWith(['Doris Klein']);
  });

  it('trennt eine eingefügte Liste an Kommas', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <PersonChipsInput
        label="Füllpersonal"
        value={[]}
        options={OPTIONS}
        onChange={onChange}
      />,
    );
    const feld = screen.getByLabelText('Füllpersonal');
    fireEvent.change(feld, { target: { value: 'Anna Huber, Bernd Maier' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['Anna Huber', 'Bernd Maier']);
  });

  it('zeigt bereits gewählte Namen nicht mehr als Vorschlag', () => {
    renderWithIntl(
      <PersonChipsInput
        label="Füllpersonal"
        value={['Anna Huber']}
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );
    const feld = screen.getByLabelText('Füllpersonal');
    fireEvent.focus(feld);
    fireEvent.keyDown(feld, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Bernd Maier' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Anna Huber' }),
    ).not.toBeInTheDocument();
  });

  it('nimmt über die Höchstzahl hinaus nichts mehr an', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <PersonChipsInput
        label="Truppmitglieder"
        value={['Anna', 'Bernd']}
        options={OPTIONS}
        max={2}
        vollText="Höchstens 2"
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Höchstens 2')).toBeInTheDocument();
    const feld = screen.getByLabelText('Truppmitglieder');
    fireEvent.change(feld, { target: { value: 'Christian' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['Anna', 'Bernd']);
  });
});
