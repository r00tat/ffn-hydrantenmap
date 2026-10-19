// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import GroupTreeChecklist from './GroupTreeChecklist';

const GROUPS = [
  { id: 'abschnitt', name: 'Abschnitt' },
  { id: 'ffa', name: 'FF Alpha', parentId: 'abschnitt' },
  { id: 'solo', name: 'Solo' },
];

function Harness({
  initial,
  onChange,
}: {
  initial: string[];
  onChange: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <GroupTreeChecklist
      groups={GROUPS}
      selected={selected}
      onChange={(next) => {
        setSelected(next);
        onChange(next);
      }}
      impliedLabel="über eine Untergruppe"
    />
  );
}

describe('GroupTreeChecklist', () => {
  it('hakt die Elterngruppe einer gewählten Untergruppe an und sperrt sie', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[]} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'FF Alpha' }));

    expect(onChange).toHaveBeenLastCalledWith(['ffa']);
    const parent = screen.getByRole('checkbox', { name: /Abschnitt/ });
    expect(parent).toBeChecked();
    expect(parent).toBeDisabled();
    expect(screen.getByText('über eine Untergruppe')).toBeInTheDocument();
  });

  it('gibt die Elterngruppe frei, wenn die Untergruppe abgewählt wird', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['ffa']} onChange={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: 'FF Alpha' }));

    const parent = screen.getByRole('checkbox', { name: 'Abschnitt' });
    expect(parent).not.toBeChecked();
    expect(parent).toBeEnabled();
  });
});
