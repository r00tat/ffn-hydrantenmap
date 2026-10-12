// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';
import StueckCollector from './StueckCollector';

vi.mock('../../hooks/useBarcodeScanner', () => ({
  default: () => ({ videoRef: { current: null }, status: 'unsupported', frames: 0 }),
}));

function Harness({ onChange }: { onChange: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <StueckCollector
      view={sampleView()}
      selectedIds={ids}
      onChange={(next) => {
        setIds(next);
        onChange(next);
      }}
      offer={(s) => s.status === 'lager'}
    />
  );
}

describe('StueckCollector', () => {
  it('nimmt ein gescanntes Stück auf und meldet unpassende', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Scannen' }));
    await user.type(screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }), '1001{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['s1']);
    expect(screen.getByText('Einsatzjacke · L · #1001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Scannen' }));
    await user.type(screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }), '1002{Enter}');
    expect(screen.getByText(/ist ausgegeben und kann hier nicht gewählt werden/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Scannen' }));
    await user.type(screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }), '999{Enter}');
    expect(screen.getByText(/Kein Stück mit der Tag-Nummer „999“/)).toBeInTheDocument();
  });

  it('bietet in der Suche nur passende Stücke an', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: /Stück suchen/ }));
    expect(screen.getByRole('option', { name: 'Einsatzjacke · L · #1001' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /#1002/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /#1003/ }));
    expect(onChange).toHaveBeenLastCalledWith(['s3']);
  });
});
