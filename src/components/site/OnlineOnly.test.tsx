// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from '@mui/material/Button';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';

const online = vi.hoisted(() => ({ value: true }));
vi.mock('../../hooks/useOnline', () => ({ default: () => online.value }));

import OnlineOnly, { useOnlineOnly } from './OnlineOnly';

function HookProbe() {
  const { offline, hint } = useOnlineOnly();
  return <span>{offline ? hint : 'online'}</span>;
}

describe('OnlineOnly', () => {
  beforeEach(() => {
    online.value = true;
  });

  it('lässt den Knopf online unverändert', async () => {
    const onClick = vi.fn();
    render(
      <OnlineOnly>
        <Button onClick={onClick}>Senden</Button>
      </OnlineOnly>,
    );
    const button = screen.getByRole('button', { name: 'Senden' });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('deaktiviert den Knopf offline und erklärt warum', async () => {
    online.value = false;
    render(
      <OnlineOnly>
        <Button>Senden</Button>
      </OnlineOnly>,
    );
    const button = screen.getByRole('button', { name: 'Senden' });
    expect(button).toBeDisabled();
    await userEvent.hover(button.parentElement!);
    expect(
      await screen.findByText('Nur mit Internetverbindung verfügbar'),
    ).toBeInTheDocument();
  });

  it('behält ein eigenes disabled online bei', () => {
    render(
      <OnlineOnly>
        <Button disabled>Senden</Button>
      </OnlineOnly>,
    );
    expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled();
  });

  it('liefert den Zustand auch als Hook', () => {
    online.value = false;
    render(<HookProbe />);
    expect(
      screen.getByText('Nur mit Internetverbindung verfügbar'),
    ).toBeInTheDocument();
  });
});
